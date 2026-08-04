// Fetches a recipe URL server-side and tries to pull out the ingredient list
// (and steps, if available) from the page's schema.org "Recipe" structured
// data. This is how most real recipe blogs/websites embed their ingredients
// in a machine-readable way. Video platforms (TikTok, Instagram, Facebook)
// generally don't expose this, so for those (or any page without it) this
// just reports back that nothing was found and the app falls back to letting
// the person paste ingredients in by hand.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: false, reason: 'post-only' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const url = body && body.url;

  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(200).json({ ok: false, reason: 'invalid-url' });
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let resp;
    try {
      resp = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FamFeedBot/1.0; +https://vercel.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      res.status(200).json({ ok: false, reason: 'fetch-failed', status: resp.status });
      return;
    }
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('html')) {
      res.status(200).json({ ok: false, reason: 'not-html' });
      return;
    }

    let html = await resp.text();
    if (html.length > 3000000) html = html.slice(0, 3000000); // safety cap

    const recipe = extractRecipeFromHtml(html);
    if (!recipe || !recipe.ingredients.length) {
      res.status(200).json({ ok: false, reason: 'no-recipe-data' });
      return;
    }

    res.status(200).json({
      ok: true,
      name: recipe.name || '',
      ingredients: recipe.ingredients,
      instructions: recipe.instructions || [],
    });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'error', message: String(e && e.message ? e.message : e) });
  }
};

module.exports.extractRecipeFromHtml = extractRecipeFromHtml; // exposed for local testing only

function extractRecipeFromHtml(html) {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of blocks) {
    let json;
    try {
      json = JSON.parse(m[1].trim());
    } catch (e) {
      continue; // some sites emit slightly-invalid JSON-LD; skip and keep looking
    }
    const found = findRecipe(json);
    if (found) return found;
  }
  return null;
}

function findRecipe(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  if (node['@graph']) {
    const r = findRecipe(node['@graph']);
    if (r) return r;
  }

  const type = node['@type'];
  const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
  if (isRecipe && node.recipeIngredient) {
    const ingredients = Array.isArray(node.recipeIngredient)
      ? node.recipeIngredient.map(cleanText).filter(Boolean)
      : [];
    if (ingredients.length) {
      return {
        name: cleanText(node.name || ''),
        ingredients,
        instructions: extractInstructions(node.recipeInstructions),
      };
    }
  }

  for (const key in node) {
    if (key === '@graph') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      const r = findRecipe(val);
      if (r) return r;
    }
  }
  return null;
}

function extractInstructions(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') return [cleanText(raw)].filter(Boolean);
  if (Array.isArray(raw)) {
    return raw
      .map((step) => {
        if (typeof step === 'string') return cleanText(step);
        if (step && typeof step === 'object') {
          if (step.text) return cleanText(step.text);
          if (step.name) return cleanText(step.name);
          if (Array.isArray(step.itemListElement)) {
            return step.itemListElement.map((s) => cleanText(s.text || s.name || '')).filter(Boolean).join(' ');
          }
        }
        return '';
      })
      .filter(Boolean);
  }
  return [];
}

function cleanText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
