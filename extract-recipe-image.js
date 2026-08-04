// Reads a photo of a recipe (a cookbook page, a printed recipe, or a
// screenshot from an app) and pulls out the ingredients and method using
// Claude's vision. This is the photo equivalent of extract-recipe.js's
// link-based pull — same {ok, name, ingredients, instructions} response
// shape, so the client can reuse all the same rendering/shopping-list code.
//
// The photo itself is never stored anywhere: it's sent to Claude, the text
// is extracted, and that's the only thing kept (as plain strings on the
// idea/side record). This keeps things simple and avoids needing separate
// file storage — by design, per how this app is set up.
//
// Requires an ANTHROPIC_API_KEY environment variable in Vercel (see
// SETUP.md). Uses plain fetch rather than the Anthropic SDK so no extra
// npm dependency is needed.
const MODEL = 'claude-haiku-4-5-20251001';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: false, reason: 'post-only' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};
  const imageBase64 = body.imageBase64;
  const mimeType = body.mimeType || 'image/jpeg';

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    res.status(200).json({ ok: false, reason: 'no-image' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(200).json({
      ok: false,
      reason: "Photo reading isn't set up yet — add an ANTHROPIC_API_KEY environment variable in Vercel (see SETUP.md), then redeploy.",
    });
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let resp;
    try {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
                {
                  type: 'text',
                  text:
                    'This is a photo of a recipe — a cookbook page, a printed recipe, or a screenshot. ' +
                    'Read it and reply with ONLY raw JSON, no markdown code fences and no other text, in exactly this shape: ' +
                    '{"name": "<recipe name, or empty string if unclear>", "ingredients": ["<one ingredient line each>"], "instructions": ["<one step each>"]}. ' +
                    "If you can't make out a recipe at all, reply with {\"name\":\"\",\"ingredients\":[],\"instructions\":[]}.",
                },
              ],
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      res.status(200).json({ ok: false, reason: 'Photo service error (' + resp.status + ')' });
      return;
    }

    const data = await resp.json();
    const textBlock = Array.isArray(data.content) ? data.content.find((c) => c && c.type === 'text') : null;
    const raw = textBlock ? textBlock.text : '';
    const cleaned = String(raw || '')
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();

    let parsed = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parsed = null;
    }

    const ingredients = parsed && Array.isArray(parsed.ingredients)
      ? parsed.ingredients.filter((x) => typeof x === 'string' && x.trim()).slice(0, 60)
      : [];

    if (!parsed || ingredients.length === 0) {
      res.status(200).json({ ok: false, reason: "Couldn't make out a recipe in that photo — try a clearer shot, or paste it in by hand." });
      return;
    }

    const instructions = Array.isArray(parsed.instructions)
      ? parsed.instructions.filter((x) => typeof x === 'string' && x.trim()).slice(0, 40)
      : [];

    res.status(200).json({
      ok: true,
      name: typeof parsed.name === 'string' ? parsed.name.trim() : '',
      ingredients,
      instructions,
    });
  } catch (e) {
    res.status(200).json({ ok: false, reason: String(e && e.message ? e.message : e) });
  }
};
