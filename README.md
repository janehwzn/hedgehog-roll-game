# 刺猬滚跑 🦔

一个小朋友口述规则、妈妈亲手做出来的手指迷宫小游戏。
规则来自 Steven（5 岁）的画和他亲口说的玩法：「刺猬滚跑，用手指在山洞里走，跟着箭头，从骷髅头的嘴巴穿过去，躲开弓箭和弹弓，走到山洞尽头就过关！」

A tiny finger-drag cave-maze game. The rules were dictated by 5-year-old Steven from his own drawing: *drag the hedgehog through the cave, follow the arrows, thread through the skull's mouth, dodge bows and slingshots, reach the end to win.*

## 📱 在手机上玩 / Play on your phone

1. 用手机浏览器打开 / Open in your phone's browser:
   **https://janehwzn.github.io/hedgehog-roll-game/**
2. 加到主屏幕 / Add to Home Screen：
   - **iPhone**：分享按钮 →「添加到主屏幕」
   - **Android**：菜单 →「添加到主屏幕」/「安装应用」
3. 点开图标就能玩，和 App 一样，还可以**离线玩**（PWA）/
   Tap the icon to play like a native app — works **offline** too.

## 🎮 怎么玩 / How to play

- 👆 **手指按住拖动**刺猬 🦔，在弯弯的山洞里走 / Drag the hedgehog with your finger
- 📷 **镜头和蓝色箭头**会告诉你往哪走 / The camera and blue arrows show the way
- 💀 从**骷髅头的嘴巴**里穿过去 / Thread through the skull's mouth
- 🏹 躲开**弓箭**（射箭）和**弹弓**（一次撒三颗石子）——红光和 `!` 是预警 / Dodge bows and slingshots; red glow + `!` is the warning
- ⭐ 吃星星，走到发光的出口过关 / Collect stars, reach the glowing exit to pass
- ❤️ 3 颗心，整局一共只有 3 颗（过关不回满，心是浅红色的）；被打中会短暂无敌；心用完小刺猬晕倒——可以用 20 颗星星换 1 颗心（每关开始前，或晕倒后）接着玩 / 3 light-red hearts for the whole run (no refill); brief invincibility after a hit; at 0 hearts the hedgehog faints — trade 20 ⭐ for 1 ❤️ to continue

## 🗺️ 关卡 / Levels — 30 caves, 3 worlds

每关一个主要挑战：新机制先安全地教，再练习，再和旧机制组合；每个世界最后一关是综合考验。
Each cave has one main idea: a new mechanic is taught safely, practised, then combined with old ones.

| 世界 / World | 洞 / Caves | 新玩法 / What you learn |
|---|---|---|
| 🌿 Mossy Caves | 1–10 | 拖动、骷髅嘴、弓箭预警、弹弓、会咬的夹子、安全小洞、会跑的夹子、黑暗+萤火虫 / drag, skulls, bows, slingshots, clamps, safe pockets, running clamps, darkness |
| 💎 Crystal Caverns | 11–20 | 钥匙与石门、骷髅王初登场、**水晶开关+限时门**、**滚石**、**风口+荆棘墙**、**金色星门**，第 20 关水晶试炼 / key & door, the Skull King, crystal switches + timed doors, rolling boulders, wind + thorns, golden star door, Crystal Trial |
| 🌙 Moonlit Hollow | 21–30 | 黑暗中的水晶、螺旋移动迷宫、三重节奏、之字冲刺、星星收集、长夜、4 秒门，最后三关骷髅王三阶段决战 / dark crystals, spiral maze, switchback sprint, star collecting, and a 3-stage Skull King finale |

老存档自动迁移：1–12 关进度不变，13 关以后按比例换算，宠物、星星、道具全部保留。
Old 100-level saves migrate automatically (caves 1–12 unchanged, later progress scaled; pets, stars and tools kept).

## 🐾 宠物 / Pets

小刺猬在山洞里交到了两个好朋友，住在「宠物小家」里。形象都由 Steven 亲手画，再由妈妈做到游戏里。

Two pets live in the Pet Home. Their looks are drawn by Steven himself.

### 🐦 小鸟泥 Birdie

- 打通**第 5 关**后解锁 / Unlocked after Level 5
- 每攒 **10 颗星星**可以换 **1 份鸟食** 🍖，喂给小鸟泥吃 / 10 ⭐ = 1 bird food
- 吃满 **10 份鸟食** → **净化成功，长大** ✨：变成更大的黑色身子、金色头和金色羽毛造型（Steven 画的净化版）/ 10 foods = purification into a bigger black-and-gold form
- 之前已经喂满的老存档会自动进化，不用重喂 / Old saves auto-evolve

### 🐱 小猫 Wesley

- 打通**第 8 关**后解锁 / Unlocked after Level 8
- 每攒 **10 颗星星**可以换 **1 份猫食** 🐟，和鸟食分开 / 10 ⭐ = 1 cat food
- 吃满 **10 份猫食** → **净化成功，长大** ✨：变成金黄大脑袋、橙色内耳、粉红肚皮、深色小爪子的坐姿大猫（Steven 画的净化版）/ 10 cat foods = purification into a bigger golden form with a pink belly

### 💾 存档 / Saving

- 网页版：宠物解锁、星星、食物、喂食进度存在浏览器本地（localStorage）
- App 存档版：全部存在你的账号里，换设备接着玩；另外还有**百宝箱**——可以用星星给小鸟泥买鸟巢（15⭐）、小衣服（20⭐）、酷眼镜（25⭐），买下自动穿上，也可以摘下

## 🛠️ 技术 / Tech

纯 HTML5 Canvas + JavaScript，无依赖，PWA（`manifest.json` + `sw.js`），一次加载后离线可玩。
核心路径/碰撞逻辑可用 Node 直接跑测试（`game.js` 导出纯函数）。

Pure HTML5 Canvas + JavaScript, no dependencies, PWA with offline support.
Path/collision logic is pure functions exported from `game.js`, unit-tested headless in Node.
