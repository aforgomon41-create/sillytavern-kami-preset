#!/usr/bin/env bash
# 搭一个本机测试酒馆：SillyTavern 1.18.0 + 酒馆助手 4.11.3（与作者的测试环境一致）
# 用法：bash test/st/setup.sh [安装目录，默认 /workspace/st-test]
set -euo pipefail
ROOT="${1:-/workspace/st-test}"
ST_TAG="${ST_TAG:-1.18.0}"
TH_TAG="${TH_TAG:-4.11.3}"
mkdir -p "$ROOT"
cd "$ROOT"
[ -d SillyTavern ] || git clone --depth 1 --branch "$ST_TAG" https://github.com/SillyTavern/SillyTavern.git SillyTavern
cd SillyTavern
npm ci --omit=dev --no-audit --no-fund
EXT=public/scripts/extensions/third-party/JS-Slash-Runner
[ -d "$EXT" ] || git clone --depth 1 --branch "$TH_TAG" https://github.com/N0VI028/JS-Slash-Runner.git "$EXT"
# 按标签固定检出不在分支上，酒馆的扩展自动更新会报错；测试环境要固定版本，关掉
sed -i 's/"auto_update": true/"auto_update": false/' "$EXT/manifest.json"
echo "装好了。启动：cd $ROOT/SillyTavern && node server.js --port 8000 --listen false --browserLaunchEnabled false"
echo "首次打开要先走完欢迎向导（填人设名并保存），否则酒馆不保存任何设置；install-preset.mjs 会自动处理。"
