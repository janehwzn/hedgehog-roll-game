# Hedgehog Roll 🦔

A tiny finger-drag cave-maze game. The rules were dictated by 5-year-old Steven from his own drawing: *drag the hedgehog through the cave, follow the arrows, thread through the skull's mouth, dodge bows and slingshots, reach the end to win.*

## 📱 Play on your phone

1. Open in your phone's browser:
   **https://janehwzn.github.io/hedgehog-roll-game/**
2. Add to Home Screen:
   - **iPhone**: Share button → "Add to Home Screen"
   - **Android**: Menu → "Add to Home Screen" / "Install app"
3. Tap the icon to play like a native app — works **offline** too (PWA).

## 🎮 How to play

- 👆 **Drag** the hedgehog 🦔 with your finger through the winding cave
- 📷 The **camera and blue arrows** show you the way
- 💀 Thread through the **skull's mouth**
- 🏹 Dodge **bows** (arrows) and **slingshots** (triple stones) — red glow + `!` is the warning
- ⭐ Collect stars, reach the glowing exit to clear the level
- ❤️ Start each run with 3 hearts; pets can generate more, up to **5 max**. Getting hit gives brief invincibility. At 0 hearts the hedgehog faints — trade 20 ⭐ for 1 ❤️ to keep going
- ⏱️ Levels 9–10 are timed — beat the clock!

## 🗺️ Levels

| # | Name | Challenge |
|---|---|---|
| 1 | Follow the Arrows | Learn the moves, no hazards |
| 2 | Skull Mouth | 1 skull + 2 bows |
| 3 | Arrow Rain | 2 skulls + 3 bows + 2 slingshots |
| 4 | Winding Cave | Narrower, twistier cave, more arrows |
| 5 | Ultimate Adventure | Tough combo stage — unlocks pet Birdie 🐦 |
| 6 | Skull Clamp | Spiky clamps snap shut! |
| 7 | Double Clamps | Two clamps, different rhythms |
| 8 | Clamp Gauntlet | Three clamps — unlocks Wesley the cat 🐱 |
| 9 | Running Clamps | Sliding clamps, 75-second limit |
| 10 | Dark Cave | Collect fireflies to light the way, 80-second limit |
| 11 | Key & Door | Find the key to unlock the stone door |
| 12 | Skull King | Giant boss with double jaws + minions |

## 🐾 Pets

The hedgehog made two friends who live in the Pet Home. Their looks are drawn by Steven himself.

### 🐦 Birdie
- Unlocked after Level 5
- 10 ⭐ = 1 bird food 🍖; 10 foods → teen, 20 foods → adult (Steven's black-and-gold drawing)
- Adult Birdie lays 1 ⭐ every morning as breakfast
- Makes ❤️ while you play: baby every 5 min, teen every 4 min, adult every 3 min

### 🐱 Wesley
- Unlocked after Level 8
- 10 ⭐ = 1 cat food 🐟; 10 foods → adult
- Adult Wesley catches 1 firefly per sleep (for the Dark Cave)
- Makes ❤️ while you play: kitten every 5 min, adult every 3 min

### 👒 Outfits & Treasure Box
Spend stars on a nest (15⭐, needed for sleep), hat (15⭐), scarf (20⭐), pajamas (25⭐). Each equipped outfit makes pets generate hearts 20% faster. Sleeping together gives double-effect feeding and dream gifts!

### 💾 Saving
- Web version: pets, stars, food, and progress live in browser localStorage
- App version: everything is saved to your account and syncs across devices

## 🛠️ Tech

Pure HTML5 Canvas + JavaScript, no dependencies. PWA (`manifest.json` + `sw.js`) with offline support. Path/collision logic is pure functions exported from `game.js`, unit-tested headless in Node.
