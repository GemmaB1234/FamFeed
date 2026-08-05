// Fetches a URL server-side and pulls out just a title + a photo — used to
// auto-fill a meal idea's name and cover photo the moment someone pastes a
// link, so they don't have to type a title by hand.
//
// This works well for normal recipe websites, blogs, and YouTube, because
// they publish this info openly (either as schema.org "Recipe" structured
// data, or as Open Graph / Twitter Card meta tags meant for link previews).
// TikTok and Instagram deliberately don't expose this to a plain server-side
// fetch (you need to be logged in, or their JS-rendered app shell has no
// usable tags in the raw HTML) — for those, this just reports back that
// nothing was found, and the app leaves the title/photo for the person to
// fill in by hand, same as it already does for ingredient-pulling.
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
    const timer = setTimeout(() => controller.abort(), 7000);
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
    if (html.length > 2000000) html = html.slice(0, 2000000); // safety cap

    const preview = extractPreview(html, url);
    if (!preview.title && !preview.image) {
      res.status(200).json({ ok: false, reason: 'no-preview-data' });
      return;
    }

    res.status(200).json({ ok: true, title: preview.title, image: preview.image });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'error', message: String(e && e.message ? e.message : e) });
  }
};

module.exports.extractPreview = extractPreview; // exposed for local testing only

function extractPreview(html, pageUrl) {
  const recipe = findRecipeNameAndImage(html);
  const ogTitle = matchMetaContent(html, 'og:title') || matchMetaContent(html, 'twitter:title');
  const ogImage = matchMetaContent(html, 'og:image') || matchMetaContent(html, 'twitter:image');
  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  const title = (recipe && recipe.name) || ogTitle || (titleTagMatch && titleTagMatch[1]) || '';
  const image = (recipe && recipe.image) || ogImage || '';

  return {
    title: cleanText(decodeEntities(title)).slice(0, 140),
    image: absolutizeUrl(decodeEntities(image), pageUrl),
  };
}

// Looks for schema.org Recipe JSON-LD and pulls out name/image, if present —
// this is usually the most accurate title (matches what the recipe is
// actually called), separate from extract-recipe.js's ingredient-focused
// version so neither risks changing the other's behaviour.
function findRecipeNameAndImage(html) {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of blocks) {
    let json;
    try {
      json = JSON.parse(m[1].trim());
    } catch (e) {
      continue;
    }
    const found = findRecipeNode(json);
    if (found) return found;
  }
  return null;
}

function findRecipeNode(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipeNode(n);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  if (node['@graph']) {
    const r = findRecipeNode(node['@graph']);
    if (r) return r;
  }

  const type = node['@type'];
  const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
  if (isRecipe && (node.name || node.image)) {
    return { name: cleanText(node.name || ''), image: firstImageUrl(node.image) };
  }

  for (const key in node) {
    if (key === '@graph') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      const r = findRecipeNode(val);
      if (r) return r;
    }
  }
  return null;
}

// schema.org "image" can be a plain URL string, an array of URL strings, an
// ImageObject ({url: "..."}), or an array of those — normalise to one URL.
function firstImageUrl(image) {
  if (!image) return '';
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    for (const item of image) {
      const u = firstImageUrl(item);
      if (u) return u;
    }
    return '';
  }
  if (typeof image === 'object' && image.url) return String(image.url);
  return '';
}

// Matches <meta property="og:title" content="..."> (or name= instead of
// property=, and either attribute order).
function matchMetaContent(html, key) {
  const re = new RegExp(
    '<meta[^>]+(?:property|name)=["\']' + key.replace(/:/g, '\\:') + '["\'][^>]*content=["\']([^"\']*)["\']',
    'i'
  );
  let m = html.match(re);
  if (m) return m[1];
  // some pages put content= before property=/name=
  const re2 = new RegExp(
    '<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + key.replace(/:/g, '\\:') + '["\']',
    'i'
  );
  m = html.match(re2);
  return m ? m[1] : '';
}

function absolutizeUrl(url, pageUrl) {
  if (!url) return '';
  try {
    return new URL(url, pageUrl).toString();
  } catch (e) {
    return url;
  }
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function cleanText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
