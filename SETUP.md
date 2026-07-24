# Fam Feed — one-time setup (about 10 minutes)

This gets you a real, live link the whole family can open, with votes syncing across everyone's phones. Everything runs on GitHub + Vercel, which you already use — no new accounts to create, no CLI required if you don't want it.

## 1. Push this folder to a new GitHub repo

Using the GitHub site or desktop app (whatever you'd normally use): create a new repo, e.g. `fam-feed`, and push these files into it — `index.html`, `package.json`, and the `api/` folder.

If you'd rather use the terminal:
```
cd fam-feed
git init
git add .
git commit -m "fam feed"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fam-feed.git
git push -u origin main
```

## 2. Import it into Vercel

1. Go to vercel.com/new and import the `fam-feed` repo.
2. Leave the settings as default (Framework Preset: **Other** is fine — no build step needed) and click **Deploy**.
3. It'll deploy successfully but voting won't save anywhere yet — that's step 3.

## 3. Add a free Redis store for the live data

1. In your Vercel project, go to the **Storage** tab.
2. Click **Create Database** (or **Browse Marketplace**) and choose **Upstash — Redis**.
3. Pick the **Free** plan, any region close to you, and click through to create it.
4. On the last step, connect it to your `fam-feed` project — this automatically adds the right environment variables (`KV_REST_API_URL` / `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — either naming works, the app handles both).

## 4. Redeploy

Environment variables only take effect on a fresh deploy:
- Go to the **Deployments** tab → click the **⋯** menu on the latest deployment → **Redeploy**.

## 5. Get your link

Once it redeploys, Vercel shows your live URL, something like:

```
https://fam-feed-yourname.vercel.app
```

**That's your shareable link.** Send it to the family group chat. First, open it yourself and add everyone's name in the 👪 Household tab — then anyone who opens the link can pick their name and start voting straight away. No login, no app install.

## Updating later

Any time you change `index.html` (colors, wording, etc.), just commit and push to GitHub — Vercel redeploys automatically. The link stays the same.

## A note on privacy

There's no login system — anyone with the link can vote and edit the plan. That's fine for a private family link; just don't post it publicly.
