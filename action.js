const Redis = require('ioredis');

if (!process.env.REDIS_URL) {
  console.error('Fam Feed: REDIS_URL environment variable is missing.');
}
// Reused across warm serverless invocations instead of reconnecting every call.
const kv = global.__famFeedRedis || (global.__famFeedRedis = new Redis(process.env.REDIS_URL));

// Single endpoint for every mutation. Body: { type, ...payload }
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};
  const { type } = body;

  try {
    switch (type) {
      case 'addMember': {
        const { id, name } = body;
        if (!id || !name) throw new Error('id and name required');
        await kv.hset('members', { [id]: name });
        break;
      }
      case 'removeMember': {
        const { id } = body;
        if (!id) throw new Error('id required');
        await kv.hdel('members', id);
        break;
      }
      case 'addIdea': {
        // Also used to save edits to an existing idea (hset overwrites the field,
        // votes live in a separate hash so they aren't touched either way).
        const { id, idea } = body;
        if (!id || !idea) throw new Error('id and idea required');
        const links = Array.isArray(idea.links) && idea.links.length
          ? normalizeLinks(idea.links)
          : [{ type: idea.sourceType || 'other', note: idea.sourceNote || '' }];
        const primary = links[0];
        await kv.hset('ideas', {
          [id]: JSON.stringify({
            name: idea.name || '',
            category: idea.category === 'safe' ? 'safe' : 'new',
            links: links,
            // kept in sync with links[0] so meal snapshots (assignMeal/setMealBackup)
            // and older clients that only know about a single link keep working.
            sourceType: primary.type,
            sourceNote: primary.note,
            protein: idea.protein || 'other',
            effort: idea.effort || 'medium',
            cuisine: idea.cuisine || 'other',
            // cover photo — either auto-pulled from a pasted link, or left blank
            // and shown as a plain placeholder tile
            image: idea.image || '',
          }),
        });
        break;
      }
      case 'removeIdea': {
        const { id } = body;
        if (!id) throw new Error('id required');
        await kv.hdel('ideas', id);
        break;
      }
      case 'voteMeal': {
        // Voting happens on what's actually planned for a night, not on the
        // speculative idea pool, so this is keyed by date rather than idea.
        const { date, memberId, choice } = body;
        if (!date || !memberId || !choice) throw new Error('date, memberId, choice required');
        const key = date + '__' + memberId;
        const current = await kv.hget('mealVotes', key);
        if (current === choice) {
          await kv.hdel('mealVotes', key); // tap same choice again to unvote
        } else {
          await kv.hset('mealVotes', { [key]: choice });
        }
        break;
      }
      case 'assignMeal': {
        const { date, ideaId } = body;
        if (!date || !ideaId) throw new Error('date and ideaId required');
        const [ideaRaw, existingMealRaw] = await Promise.all([
          kv.hget('ideas', ideaId),
          kv.hget('meals', date),
        ]);
        const idea = safeParse(ideaRaw, { name: '', category: 'new', sourceType: 'other', sourceNote: '' });
        const existingMeal = safeParse(existingMealRaw, {});
        const changingDish = existingMeal.ideaId !== ideaId;
        await kv.hset('meals', {
          [date]: JSON.stringify({
            ideaId: ideaId,
            name: idea.name,
            category: idea.category === 'safe' ? 'safe' : 'new',
            sourceType: idea.sourceType,
            sourceNote: idea.sourceNote,
            backupFood: existingMeal.backupFood || '',
            // changing the main dish keeps whatever sides were already picked for the night
            sideIds: mealSideIds(existingMeal),
            sideNames: existingMeal.sideNames || (existingMeal.sideName ? [existingMeal.sideName] : []),
          }),
        });
        // Votes were cast about whatever was previously planned for this
        // night — swapping in a different dish starts the vote fresh.
        if (changingDish) await clearMealVotes(date);
        break;
      }
      case 'clearMeal': {
        const { date } = body;
        if (!date) throw new Error('date required');
        await kv.hdel('meals', date);
        await clearMealVotes(date);
        break;
      }
      case 'setMealBackup': {
        const { date, backupFood } = body;
        if (!date) throw new Error('date required');
        const existingRaw = await kv.hget('meals', date);
        const existing = safeParse(existingRaw, { name: '', category: 'new', sourceType: 'other', sourceNote: '' });
        existing.backupFood = backupFood || '';
        await kv.hset('meals', { [date]: JSON.stringify(existing) });
        break;
      }
      case 'toggleMealSide': {
        // A meal can have several sides at once (e.g. rice AND garlic bread) —
        // this adds/removes one side id from the meal's sideIds list.
        const { date, sideId, on } = body;
        if (!date || !sideId) throw new Error('date and sideId required');
        const [existingRaw, allSidesRaw] = await Promise.all([
          kv.hget('meals', date),
          kv.hgetall('sides'),
        ]);
        const existing = safeParse(existingRaw, { name: '', category: 'new', sourceType: 'other', sourceNote: '' });
        let ids = mealSideIds(existing);
        const pos = ids.indexOf(sideId);
        if (on && pos === -1) ids.push(sideId);
        if (!on && pos !== -1) ids.splice(pos, 1);
        const allSides = allSidesRaw || {};
        existing.sideIds = ids;
        existing.sideNames = ids
          .map((id) => (allSides[id] ? safeParse(allSides[id], null) : null))
          .filter(Boolean)
          .map((s) => s.name);
        await kv.hset('meals', { [date]: JSON.stringify(existing) });
        break;
      }
      case 'addSafeFood': {
        const { id, name } = body;
        if (!id || !name) throw new Error('id and name required');
        await kv.hset('safeFoods', { [id]: name });
        break;
      }
      case 'removeSafeFood': {
        const { id } = body;
        if (!id) throw new Error('id required');
        await kv.hdel('safeFoods', id);
        break;
      }
      case 'addSide': {
        // Also used to save edits to an existing side (hset overwrites the field).
        const { id, side } = body;
        if (!id || !side) throw new Error('id and side required');
        const links = Array.isArray(side.links) && side.links.length
          ? normalizeLinks(side.links)
          : [{ type: 'other', note: '' }];
        await kv.hset('sides', {
          [id]: JSON.stringify({ name: side.name || '', links, image: side.image || '' }),
        });
        break;
      }
      case 'removeSide': {
        const { id } = body;
        if (!id) throw new Error('id required');
        await kv.hdel('sides', id);
        break;
      }
      case 'addItem': {
        const { id, item } = body;
        if (!id || !item) throw new Error('id and item required');
        await kv.hset('shoppingList', { [id]: JSON.stringify(item) });
        break;
      }
      case 'toggleItem': {
        const { id, checked } = body;
        if (!id) throw new Error('id required');
        const raw = await kv.hget('shoppingList', id);
        const item = safeParse(raw, null);
        if (item) {
          item.checked = !!checked;
          await kv.hset('shoppingList', { [id]: JSON.stringify(item) });
        }
        break;
      }
      case 'deleteItem': {
        const { id } = body;
        if (!id) throw new Error('id required');
        await kv.hdel('shoppingList', id);
        break;
      }
      case 'clearChecked': {
        const all = await kv.hgetall('shoppingList');
        const toDelete = Object.keys(all || {}).filter((id) => {
          const item = safeParse(all[id], null);
          return item && item.checked;
        });
        if (toDelete.length) await kv.hdel('shoppingList', ...toDelete);
        break;
      }
      case 'archiveWeek': {
        const { id, week, label } = body;
        if (!id || !week) throw new Error('id and week required');
        const all = await kv.hgetall('shoppingList');
        const idsInWeek = Object.keys(all || {}).filter((itemId) => {
          const item = safeParse(all[itemId], null);
          return item && Number(item.week || 1) === Number(week);
        });
        const items = idsInWeek.map((itemId) => safeParse(all[itemId], null)).filter(Boolean);
        await kv.hset('archivedLists', {
          [id]: JSON.stringify({
            archivedAt: new Date().toISOString(),
            label: label || ('Week ' + week),
            items,
          }),
        });
        if (idsInWeek.length) await kv.hdel('shoppingList', ...idsInWeek);
        break;
      }
      case 'deleteArchive': {
        const { id } = body;
        if (!id) throw new Error('id required');
        await kv.hdel('archivedLists', id);
        break;
      }
      default:
        res.status(400).json({ error: 'unknown action type: ' + type });
        return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};

function safeParse(str, fallback) {
  if (str === null || str === undefined) return fallback;
  try {
    var parsed = JSON.parse(str);
    return parsed === null ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

// Removes any cast votes for a given night — used whenever that night's
// assignment changes or is cleared, since a vote only makes sense for
// whatever's currently planned.
async function clearMealVotes(date) {
  const allVotes = await kv.hgetall('mealVotes');
  const toDelete = Object.keys(allVotes || {}).filter((k) => k.indexOf(date + '__') === 0);
  if (toDelete.length) await kv.hdel('mealVotes', ...toDelete);
}

// Reads a meal's attached side ids, migrating older meals that only had a
// single `sideId` field before multiple sides per meal was supported.
function mealSideIds(meal) {
  if (Array.isArray(meal.sideIds)) return meal.sideIds.slice();
  if (meal.sideId) return [meal.sideId];
  return [];
}

// Cleans up a links array from the client before saving an idea/side. Carries
// through `extracted` (ingredients/instructions read from a photo at upload
// time) when present, with defensive length caps — the photo itself is never
// stored, only this small bit of text.
function normalizeLinks(links) {
  return links.map((l) => {
    const out = { type: (l && l.type) || 'other', note: (l && l.note) || '' };
    if (l && l.extracted && Array.isArray(l.extracted.ingredients) && l.extracted.ingredients.length) {
      out.extracted = {
        ingredients: l.extracted.ingredients.filter((x) => typeof x === 'string').slice(0, 60),
        instructions: Array.isArray(l.extracted.instructions)
          ? l.extracted.instructions.filter((x) => typeof x === 'string').slice(0, 40)
          : [],
      };
    }
    return out;
  });
}
