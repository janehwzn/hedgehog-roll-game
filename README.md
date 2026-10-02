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
- ❤️ 3 颗心，整局 8 关一共只有 3 颗（过关不回满，心是浅红色的）；被打中会短暂无敌；心用完小刺猬晕倒——可以用 20 颗星星换 1 颗心（每关开始前，或晕倒后）接着玩 / 3 light-red hearts for the whole 8-level run (no refill); brief invincibility after a hit; at 0 hearts the hedgehog faints — trade 20 ⭐ for 1 ❤️ to continue

## 🗺️ 关卡 / Levels

| 关卡 | 名字 | 挑战 |
|---|---|---|
| 1 | 跟着箭头走 | 熟悉操作，无障碍 |
| 2 | 骷髅头的嘴巴 | 1 个骷髅 + 2 张弓 |
| 3 | 箭雨大冒险 | 2 个骷髅 + 3 张弓 + 2 个弹弓 |
| 4 | 弯弯大山洞 | 山洞更窄更弯，箭更多 |
| 6 | 骷髅大夹子 | 长着尖刺的夹子会突然夹人！ |
| 7 | 双夹子 | 两个夹子，一快一慢 |
| 8 | 终极夹子阵 | 三个夹子，各有各的节奏 |

## 🛠️ 技术 / Tech

纯 HTML5 Canvas + JavaScript，无依赖，PWA（`manifest.json` + `sw.js`），一次加载后离线可玩。
核心路径/碰撞逻辑可用 Node 直接跑测试（`game.js` 导出纯函数）。

Pure HTML5 Canvas + JavaScript, no dependencies, PWA with offline support.
Path/collision logic is pure functions exported from `game.js`, unit-tested headless in Node.
