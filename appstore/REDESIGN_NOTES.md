# Cozy storybook redesign: notes

This redesign was co-designed by Claude (implementation) and ChatGPT (design review). It changes only the UI layer. Canvas gameplay, level data, physics and the save key `birdie-pet-v1` are untouched, so existing players keep all their progress.

## What's new

- **Home screen:** an animated Pip (blinks, bobs, tilts) with the tagline "Tiny paws. Big adventures." One big **Let's Roll!** button continues from your furthest cave, with **Cave Map** and **Pet Hollow** below it. The 14-line rules wall is gone.
- **Pre-level card:** a bottom sheet over the cave showing the region, cave name and one hint. **Progressive tips** appear the first time a mechanic shows up (arrows, slingshots, clamps, dark caves, keys, the Skull King…). The full list is under ⚙️ → How to play.
- **HUD:** rounded frosted pills (hearts · Cave N + timer · stars found/total) and a ⏸ pause button. Shield and bomb moved to the bottom-right thumb zone, so the hint banner no longer covers them. The game auto-pauses when the app goes to the background.
- **Cave cleared sheet:** after each cave, with stars found, hearts left, Star jar, **Next Cave**, Pet Hollow and Map. It replaces the auto-advance banner.
- **Oops sheet:** "Pip needs a little rest". **Try this cave again** (fresh 3 hearts) is now the main action. *Keep going* (20 ⭐ → 1 ❤️) and *Start at Cave 1* are still there.
- **Cave Map:** 100 caves in four worlds (Mossy Caves, Crystal Caverns, Moonlit Hollow, Skull King's Lair), drawn as a winding trail. Explored caves are ✓, the current cave has a ring and a "Next" tag, and locked caves show 🔒. Skull King caves have a dashed border.
- **Pet Hollow:** always reachable, with an empty state until Cave 5. Tabs: Friends · Treats · Wardrobe · Tools · Shop (native app only, behind a parental gate).
- **Settings:** sound on/off, How to play, the bundled privacy policy, and the credit to Steven.
- **Visual system:** colour tokens (Oat Milk, Cocoa, Caramel, Butter, Mint, Sky, Berry, Moss), the system rounded font (SF Pro Rounded on iPhone, which works offline), 44px+ touch targets, safe areas, and `prefers-reduced-motion` support.

## Bugs fixed along the way

- Hint text showed `U0001F52D` literally. The JS escapes were `\U…` instead of `\u{…}`.
- Buying a shield or bomb **charged stars twice**, because the button had both `onclick` and `addEventListener`.
- The HUD level label was cut off ("Level 1 ·").
- Banners told players to "get shields in the Pet Home" before the Pet Home could be opened.
- Google Fonts were loaded from the internet, so they never appeared offline or in the iOS app.
- The service worker cache was bumped to `v12` so PWA players get the new UI.

## Product decisions for Sophie

1. **Free retry.** "Try this cave again" gives a fresh 3 hearts at the same cave. The old build already let players do this in a roundabout way (restart → Levels → pick the cave), so the economy is unchanged. It's just quicker now. If you want hearts to matter more, make retry cost something.
2. **Hero name.** "Pip" is a proposal. Steven might want to name the hedgehog himself! Change `HERO_NAME` in `game.js`.
3. **Hearts IAP.** See the warning in `APP_STORE_LAUNCH.md` §4.
4. **Kids Category or not.** See `APP_STORE_LAUNCH.md` §3.

## New save data

UI preferences live in a separate key, `hedgehog-ui-v1` (`sound`, `seenTips`). Existing players have the tips for caves they've already cleared marked as seen, so veterans don't get beginner tips.

## Testing

`?debug` in the URL exposes `window.__hr` for automated UI tests. It is off by default.
