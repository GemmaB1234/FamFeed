const { Redis } = require('@upstash/redis');
const kv = Redis.fromEnv();

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
      case 'setMealField': {
        const { date, field, value } = body;
        if (!date || !field) throw new Error('date and field required');
        const existingRaw = await kv.hget('meals', date);
        const existing = safeParse(existingRaw, { name: '', sourceType: 'other', sourceNote: '' });
        existing[field] = value;
        await kv.hset('meals', { [date]: JSON.stringify(existing) });
        break;
      }
      case 'vote': {
        const { date, memberId, choice } = body;
        if (!date || !memberId || !choice) throw new Error('date, memberId, choice required');
        const key = date + '__' + memberId;
        const current = await kv.hget('votes', key);
        if (current === choice) {
          await kv.hdel('votes', key); // tap same choice again to unvote
        } else {
          await kv.hset('votes', { [key]: choice });
        }
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
