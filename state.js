const Redis = require('ioredis');

if (!process.env.REDIS_URL) {
  console.error('Fam Feed: REDIS_URL environment variable is missing.');
}
// Reused across warm serverless invocations instead of reconnecting every call.
const kv = global.__famFeedRedis || (global.__famFeedRedis = new Redis(process.env.REDIS_URL));

// Returns the full app state in one call:
// {
//   members: {id: name},
//   ideas: {id: {name, sourceType, sourceNote}},                                // Mains suggestion pool — no votes here
//   meals: {date: {ideaId, name, sourceType, sourceNote, votes:{memberId:choice}}},  // assigned plan — voting lives here
//   shoppingList: {id: item}
// }
module.exports = async (req, res) => {
  try {
    const [members, ideasRaw, mealsRaw, mealVotesRaw, shoppingRaw, archivedRaw, safeFoods, sidesRaw] = await Promise.all([
      kv.hgetall('members'),
      kv.hgetall('ideas'),
      kv.hgetall('meals'),
      kv.hgetall('mealVotes'),
      kv.hgetall('shoppingList'),
      kv.hgetall('archivedLists'),
      kv.hgetall('safeFoods'),
      kv.hgetall('sides'),
    ]);

    const ideas = {};
    Object.keys(ideasRaw || {}).forEach((id) => {
      ideas[id] = safeParse(ideasRaw[id], {});
    });

    const meals = {};
    Object.keys(mealsRaw || {}).forEach((date) => {
      meals[date] = safeParse(mealsRaw[date], {});
      if (!meals[date].votes) meals[date].votes = {};
    });

    // mealVotes hash fields look like "date__memberId" -> "yum" — voting is
    // about what's actually planned for a night, not the idea pool.
    Object.keys(mealVotesRaw || {}).forEach((key) => {
      const idx = key.indexOf('__');
      if (idx === -1) return;
      const date = key.slice(0, idx);
      const memberId = key.slice(idx + 2);
      if (!meals[date]) return; // vote for a night that's since been cleared/changed
      if (!meals[date].votes) meals[date].votes = {};
      meals[date].votes[memberId] = mealVotesRaw[key];
    });

    const shoppingList = {};
    Object.keys(shoppingRaw || {}).forEach((id) => {
      shoppingList[id] = safeParse(shoppingRaw[id], {});
    });

    const archivedLists = {};
    Object.keys(archivedRaw || {}).forEach((id) => {
      archivedLists[id] = safeParse(archivedRaw[id], {});
    });

    const sides = {};
    Object.keys(sidesRaw || {}).forEach((id) => {
      sides[id] = safeParse(sidesRaw[id], {});
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      members: members || {},
      ideas,
      meals,
      shoppingList,
      archivedLists,
      safeFoods: safeFoods || {},
      sides,
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
