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
        const { id, idea } = body;
        if (!id || !idea) throw new Error('id and idea required');
        await kv.hset('ideas', {
          [id]: JSON.stringify({
            name: idea.name || '',
            sourceType: idea.sourceType || 'other',
            sourceNote: idea.sourceNote || '',
          }),
        });
        break;
      }
      case 'removeIdea': {
        const { id } = body;
        if (!id) throw new Error('id required');
        await kv.hdel('ideas', id);
        // clean up any votes cast on this idea
        const allVotes = await kv.hgetall('ideaVotes');
        const toDelete = Object.keys(allVotes || {}).filter((k) => k.indexOf(id + '__') === 0);
        if (toDelete.length) await kv.hdel('ideaVotes', ...toDelete);
        break;
      }
      case 'voteIdea': {
        const { ideaId, memberId, choice } = body;
        if (!ideaId || !memberId || !choice) throw new Error('ideaId, memberId, choice required');
        const key = ideaId + '__' + memberId;
        const current = await kv.hget('ideaVotes', key);
        if (current === choice) {
          await kv.hdel('ideaVotes', key); // tap same choice again to unvote
        } else {
          await kv.hset('ideaVotes', { [key]: choice });
        }
        break;
      }
      case 'assignMeal': {
        const { date, ideaId } = body;
        if (!date || !ideaId) throw new Error('date and ideaId required');
        const ideaRaw = await kv.hget('ideas', ideaId);
        const idea = safeParse(ideaRaw, { name: '', sourceType: 'other', sourceNote: '' });
        await kv.hset('meals', {
          [date]: JSON.stringify({
            ideaId: ideaId,
            name: idea.name,
            sourceType: idea.sourceType,
            sourceNote: idea.sourceNote,
          }),
        });
        break;
      }
      case 'clearMeal': {
        const { date } = body;
        if (!date) throw new Error('date required');
        await kv.hdel('meals', date);
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
