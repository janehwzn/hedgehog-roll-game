# Hedgehog Roll: App Store launch kit

This file covers everything needed to ship v1.0 to the iPhone App Store. The code side is done. The steps under "On your Mac" need Xcode and an Apple Developer account, so they can't be done from the cloud.

## 1. What changed in the iOS project

| File | Change | Why |
|---|---|---|
| `Assets.xcassets/AppIcon…/AppIcon-512@2x.png` | New 1024×1024 Pip icon (RGB, no transparency) | The project was still using **Capacitor's default placeholder icon**, which Apple rejects |
| `Assets.xcassets/Splash.imageset/*` | New cream splash with Pip | Replaces the Capacitor placeholder splash |
| `App/Info.plist` | `armv7` → `arm64`, portrait only, `ITSAppUsesNonExemptEncryption = NO`, dark status bar | The game is portrait-only, armv7 is obsolete, and this skips the export-compliance question on every upload |
| `App/PrivacyInfo.xcprivacy` (new, added to the target) | No tracking, no data collected, UserDefaults reason `CA92.1` | Apple requires a privacy manifest |
| `project.pbxproj` | `TARGETED_DEVICE_FAMILY = 1` (iPhone only) | An iPad build would need all four orientations and iPad screenshots. To add iPad later, set this back to `"1,2"` |
| `capacitor.config.json` | Cream background colour | Avoids a dark flash at launch |
| `sync-www.sh` | Also copies `privacy-policy.html` | The in-app privacy link needs the file inside the bundle |

## 2. On your Mac (about 1 hour)

```bash
git pull
cd apk
npm ci
bash sync-www.sh          # copies index.html, game.js, icons, privacy policy into www/
npx cap sync ios
npx cap open ios          # opens Xcode
```

In Xcode:

1. Select the **App** target, then **Signing & Capabilities**. Pick your Team and keep the Bundle ID `com.janehwzn.hedgehogroll`.
2. Choose **+ Capability**, then **In-App Purchase**.
3. Under **General**, set Version `1.0` and Build `1`. Increase Build for every upload.
4. Run on a real iPhone and work through the test checklist in section 5.
5. Set the destination to **Any iOS Device**, then choose **Product → Archive → Distribute App → App Store Connect → Upload**.

## 3. App Store Connect setup

**App record**

- Name: **Hedgehog Roll Adventure** (23/30 characters; "Hedgehog Roll" is already taken)
- Subtitle: **Cute cave-maze adventures** (25/30)
- Bundle ID: `com.janehwzn.hedgehogroll`
- SKU: `hedgehogroll-ios-1`
- Primary category: **Games**. Subcategories: Puzzle, Casual
- Privacy policy URL: `https://janehwzn.github.io/hedgehog-roll-game/privacy-policy.html` (works once this branch is merged and GitHub Pages redeploys)

**Kids Category: decide before you submit, because it can't be changed after approval.**
Our recommendation (Claude and ChatGPT agree): if children are the main audience, choose the **Kids Category, ages 6–8**. The build already meets its main rules:

- no ads
- no analytics or third-party SDKs
- purchases sit in a separate Shop tab behind a parental gate (a times-table question written in words)
- the only in-app link is the bundled privacy policy, and it has no external links

If you'd rather call it a family game, choose a regular Games listing with a 4+ age rating.

**Age rating questionnaire:** answer "None" to every content question. For "Cartoon or Fantasy Violence", choose **Infrequent/Mild**: skulls and arrows appear, nothing gory, and you bump and lose a heart. That gives a **4+** rating.

**App Privacy ("nutrition label"):** **Data Not Collected.**

**Promotional text (170 max)**

> Meet Pip, a tiny hedgehog with a big sense of adventure. Roll through twisty caves, collect twinkly stars, dodge silly surprises, and make little animal friends.

**Description**

> A tiny hedgehog. A twisty cave. A whole world of little adventures.
>
> Meet Pip and guide your prickly pal through winding caves full of stars, surprises and secret friends. Follow the blue arrows, slip past silly traps, and find the glowing exit, one cozy cave at a time.
>
> • Easy finger-drag controls, made for small hands
> • 100 caves across four worlds: Mossy Caves, Crystal Caverns, Moonlit Hollow and the Skull King's Lair
> • Twinkly stars, combo bonuses and gentle challenges
> • Meet Birdie and Wesley, then feed them, tuck them in and dress them up in Pet Hollow
> • New tips pop up only when a new challenge appears, so kids can jump straight in
> • Plays offline. No ads. No accounts. No data collected.
>
> Hedgehog Roll was inspired by a five-year-old's drawings. Steven made up the caves and the rules, and his mom built the game.

**Keywords (100 max):** `hedgehog,maze,cave,kids,cute,pets,puzzle,cozy,animals,stars,casual,labyrinth,bird,kitten` (88)

**Support URL:** `https://github.com/janehwzn/hedgehog-roll-game`. A simple GitHub Pages "support" page with your email would be friendlier.

**Screenshots:** upload the five files in `appstore/screenshots/` (`appstore-6.9in-*.png`, 1290×2796, accepted for the 6.9" slot; Apple scales them down for smaller iPhones). They were captured from the real build in Chromium, so the font is a close stand-in for SF Rounded. For pixel-exact final art, re-capture on the iPhone 16 Pro Max simulator (⌘S) and run `appstore/make_screenshots.py` again, or upload the simulator shots as they are.

| # | Caption |
|---|---|
| 1 | Tiny paws. Big adventures. |
| 2 | Drag, dodge and discover. |
| 3 | Collect stars. Unlock surprises. |
| 4 | Meet your new besties. |
| 5 | 100 cozy caves to explore. |

## 4. In-app purchases (all Consumable)

Create these in **App Store Connect → Monetization → In-App Purchases**. The product IDs must match `game.js` exactly.

| Product ID | Reference name | Gives | Suggested price |
|---|---|---|---|
| `heart_pack_5` | 5 Hearts | +5 ❤️ (capped at 5 in a run) | $0.99 |
| `bird_food_5` | 5 Bird Food | +5 🍖 | $0.99 |
| `cat_food_5` | 5 Cat Food | +5 🐟 | $0.99 |
| `water_pack_5` | 5 Water | +5 💧 | $0.99 |
| `shield_pack_3` | 3 Shields | +3 🛡️ | $0.99 |
| `bomb_pack_3` | 3 Bombs | +3 💣 | $0.99 |

Each one needs a display name, a description, and a review screenshot of the Shop tab. **Attach all six to the 1.0 version before submitting**, because first-time IAPs are reviewed with the app.

> ⚠️ **Known issue to decide on:** `heart_pack_5` adds hearts to the *current run*. Hearts are capped at 5 and reset when a new run starts, so a parent may feel they paid for something that disappeared. Consider removing it from v1 or changing it to a permanent item. The other five products are saved to the device and don't have this problem.

Consumables don't need a "Restore Purchases" button.

**Notes for App Review** (paste into the review notes):

> Hedgehog Roll is a kids' finger-drag maze game. No account or login is needed. The optional Shop is in Pet Hollow → "Shop" tab and is protected by a parental gate (a multiplication question written in words, e.g. "What is seven times eight?"). Everything sold can also be earned with in-game stars. The app collects no data, shows no ads, and makes no network requests.

## 5. Test checklist on a real iPhone

- [ ] **Fresh install:** Home → Let's Roll → Cave 1 shows the "Drag to roll" tip → finish → "Cave conquered" sheet → Next Cave
- [ ] **Returning player:** install the previous build, play to Cave 6, install the new build. Stars, pets and unlocked caves must all be kept (save key `birdie-pet-v1` is unchanged)
- [ ] **Pause:** tap ⏸ mid-cave. Also check that switching apps pauses automatically
- [ ] **Out of hearts:** "Try Cave N again" restarts that cave with 3 hearts. "Keep going" costs 20 ⭐
- [ ] **Pet Hollow before Cave 5** shows the empty state. After Cave 5 Birdie appears, and after Cave 8 Wesley appears
- [ ] **Shop tab:** a wrong answer stays locked. A right answer opens it, prices load, and a sandbox purchase delivers the items. Cancelling a purchase changes nothing
- [ ] **Airplane mode:** the game fully works
- [ ] **Settings:** the Sounds toggle mutes everything and the privacy policy opens inside the app
- [ ] **Small screen** (iPhone SE): Home, sheets and the map fit without clipping
- [ ] **Reduce Motion** turned on in iOS Settings: confetti and bouncing stop

## 6. Common rejection risks, already handled

- Placeholder icon or splash → replaced
- No privacy manifest → added
- IAP reachable by children without a gate → gated Shop tab, visible only in the native app
- External links in a kids app → removed (`mailto` is now plain text, and the privacy policy is bundled)
- Broken UI text (`\U0001F52D` showing literally) → fixed
- Double-charging stars when buying a shield or bomb → fixed

Still open: the hearts-pack question in section 4, and choosing the Kids Category.
