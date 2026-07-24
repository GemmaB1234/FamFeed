const { Redis } = require('@upstash/redis');
const kv = Redis.fromEnv();

// Returns the full app state in one call:
// { members: {id: name}, meals: {date: {name, sourceType, sourceNote, votes:{memberId:choice}}}, shoppingList: {id: item} }
module.exports = async (req, res) => {
  try {
    const [members, mealsRaw, votesRaw, shoppingRaw] = await Promise.all([
      kv.hgetall('members'),
      kv.hgetall('meals'),
      kv.hgetall('votes'),
      kv.hgetall('shoppingList'),
    ]);

    const meals = {};
    Object.keys(mealsRaw || {}).forEach((date) => {
      meals[date] = safeParse(mealsRaw[date], {});
    });

    // votes hash fields look like "2026-07-24__abc123" -> "yum"
    Object.keys(votesRaw || {}).forEach((key) => {
      const idx = key.indexOf('__');
      if (idx === -1) return;
      const date = key.slice(0, idx);
      const memberId = key.slice(idx + 2);
      if (!meals[date]) meals[date] = {};
      if (!meals[date].votes) meals[date].votes = {};
      meals[date].votes[memberId] = votesRaw[key];
    });

    const shoppingList = {};
    Object.keys(shoppingRaw || {}).forEach((id) => {
      shoppingList[id] = safeParse(shoppingRaw[id], {});
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      members: members || {},
      meals,
      shoppingList,
    });
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
