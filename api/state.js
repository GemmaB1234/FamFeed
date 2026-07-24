const Redis = require('ioredis');

if (!process.env.REDIS_URL) {
  console.error('Fam Feed: REDIS_URL environment variable is missing.');
}
// Reused across warm serverless invocations instead of reconnecting every call.
const kv = global.__famFeedRedis || (global.__famFeedRedis = new Redis(process.env.REDIS_URL));

// Returns the full app state in one call:
// {
//   members: {id: name},
//   ideas: {id: {name, sourceType, sourceNote, votes:{memberId:choice}}},   // "Can we have?" pool
//   meals: {date: {ideaId, name, sourceType, sourceNote}},                  // assigned plan
//   shoppingList: {id: item}
// }
module.exports = async (req, res) => {
  try {
    const [members, ideasRaw, ideaVotesRaw, mealsRaw, shoppingRaw] = await Promise.all([
      kv.hgetall('members'),
      kv.hgetall('ideas'),
      kv.hgetall('ideaVotes'),
      kv.hgetall('meals'),
      kv.hgetall('shoppingList'),
    ]);

    const ideas = {};
    Object.keys(ideasRaw || {}).forEach((id) => {
      ideas[id] = safeParse(ideasRaw[id], {});
      if (!ideas[id].votes) ideas[id].votes = {};
    });

    // ideaVotes hash fields look like "ideaId__memberId" -> "yum"
    Object.keys(ideaVotesRaw || {}).forEach((key) => {
      const idx = key.indexOf('__');
      if (idx === -1) return;
      const ideaId = key.slice(0, idx);
      const memberId = key.slice(idx + 2);
      if (!ideas[ideaId]) ideas[ideaId] = { name: '', sourceType: 'other', sourceNote: '', votes: {} };
      if (!ideas[ideaId].votes) ideas[ideaId].votes = {};
      ideas[ideaId].votes[memberId] = ideaVotesRaw[key];
    });

    const meals = {};
    Object.keys(mealsRaw || {}).forEach((date) => {
      meals[date] = safeParse(mealsRaw[date], {});
    });

    const shoppingList = {};
    Object.keys(shoppingRaw || {}).forEach((id) => {
      shoppingList[id] = safeParse(shoppingRaw[id], {});
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      members: members || {},
      ideas,
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
