# Getting Fam Feed onto phones via TestFlight

This turns your live web app into a real native-feeling iOS app your family installs like any other app — no public App Store listing, no risky Apple review, just you and up to 100 people you invite. It uses the Apple Developer Program membership you already have.

**How this works:** the native app is a thin shell (built with a tool called Capacitor) that opens your live Vercel site full-screen with a proper app icon — it is not a copy of the code. That means once it's installed, any future changes you make (new features, fixes) just need a `git push` to update the live site — everyone using the app sees the update immediately, no App Store resubmission needed. You only need to repeat the Xcode/TestFlight steps below if you change the app icon or app name.

You'll need: a Mac with **Xcode** installed (free, from the Mac App Store), your live Vercel URL from the earlier setup, and your Apple Developer Program membership (already active).

A quick terminology note before you start: TestFlight has two kinds of testers. **Internal testers** must be members of your paid App Store Connect account — not what you want for casually inviting family. **External testers** can be any email address, which is what you want for your 7 family members, and only needs one light "Beta App Review" (usually hours, not the strict weeks-long full App Store review).

## 1. Get your files ready

Make sure your GitHub repo has these files (all provided): `index.html`, `package.json`, `api/`, `capacitor.config.json`, `www/index.html`, `privacy.html`, `app-icon-1024.png`.

Open `capacitor.config.json` and replace the placeholder URL with your actual live Vercel URL (the one from SETUP.md, e.g. `https://fam-feed-yourname.vercel.app`):

```json
"server": {
  "url": "https://fam-feed-yourname.vercel.app",
  ...
}
```

Also push `privacy.html` up — once deployed it'll be live at `https://your-vercel-url.vercel.app/privacy.html`. Keep that link handy; App Store Connect will ask for it.

## 2. Install Capacitor (one-time, on your Mac)

In Terminal, `cd` into your project folder, then:

```
npm install --save-dev @capacitor/core @capacitor/cli @capacitor/ios @capacitor/assets
npx cap add ios
```

This creates an `ios/` folder containing a full Xcode project.

## 3. Generate the app icon

```
npx capacitor-assets generate --ios
```

This reads `app-icon-1024.png` and automatically creates every icon size Apple requires.

## 4. Sync and open in Xcode

```
npx cap sync
npx cap open ios
```

Xcode opens with your project.

## 5. Configure signing in Xcode

1. Click the project name in the left sidebar, then the app target.
2. Go to **Signing & Capabilities**.
3. Under **Team**, choose your Apple Developer Program account.
4. Set the **Bundle Identifier** to something unique, e.g. `com.yourname.famfeed` (must match what you put in `capacitor.config.json`'s `appId` if you change it — keep them in sync).
5. Tick **Automatically manage signing**.

## 6. Test it on your own phone (optional but recommended)

Plug your iPhone into your Mac, select it as the build target in Xcode's toolbar, and click the ▶️ Run button. The app installs directly on your phone so you can check it looks right before going further.

## 7. Create the app record in App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**.
2. Platform: iOS. Name: "Fam Feed" (or whatever you like — this is just for your account, not public). Bundle ID: pick the one you set in Xcode. SKU: any unique string, e.g. `famfeed001`.
3. Save.

## 8. Archive and upload the build

Back in Xcode:
1. At the top, change the destination to **Any iOS Device**.
2. Menu: **Product → Archive**. This takes a few minutes.
3. When the Organizer window appears, click **Distribute App → App Store Connect → Upload**, following the prompts (defaults are fine).

It'll take roughly 15–60 minutes for the build to finish processing on Apple's side before it appears in App Store Connect.

## 9. Fill in TestFlight test information

In App Store Connect, open your app → **TestFlight** tab:
1. Under **Test Information**, add a short **Beta App Description** (e.g. "Private family meal planner") and a **feedback email** (any email you check).
2. Under **App Privacy**, add the privacy policy URL: `https://your-vercel-url.vercel.app/privacy.html`.
3. Fam Feed has no login, so you can leave "Sign-In Required" off.

## 10. Create an External Testing group and invite family

1. Still in the TestFlight tab, under **External Testing**, click **+** to create a group (e.g. "Family").
2. Add your uploaded build to the group.
3. Add testers by email — your 7 family members' Apple IDs.
4. Submit for **Beta App Review**. This first review is required and typically takes anywhere from a few hours to a couple of days — much lighter than a full App Store review, and mainly checks the app doesn't crash and matches your description.
5. Once approved, each family member gets an email invite. They install the free **TestFlight** app from the App Store, tap the invite link, and Fam Feed installs with a proper icon on their home screen.

## Updating later

- **Changed a feature or fixed a bug in `index.html`/`api/`?** Just push to GitHub — Vercel redeploys automatically, and everyone's installed app picks it up next time they open it. No Xcode, no re-review.
- **Changed the app icon or name?** You'll need to repeat steps 4–10 (a new build). Subsequent builds to an already-approved external group usually skip full review.

## A note on TestFlight's own limits

Apple expires TestFlight builds after 90 days — after that, you'd need to upload a fresh build (same steps 8–10) to keep it installed. For a private family tool that's a minor once-a-quarter chore, not a blocker.
