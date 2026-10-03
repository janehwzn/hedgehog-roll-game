#!/bin/bash
# 把仓库根目录的游戏文件同步到 Capacitor 的 www/ 目录
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/apk/www"
cp "$ROOT/index.html" "$ROOT/game.js" "$ROOT/manifest.json" "$ROOT/sw.js" \
   "$ROOT/icon-192.png" "$ROOT/icon-512.png" "$ROOT/apk/www/"
echo "www synced: $(ls "$ROOT/apk/www" | tr '\n' ' ')"
