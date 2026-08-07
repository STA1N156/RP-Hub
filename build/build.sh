#!/usr/bin/env bash
# RP-Hub 性能优化构建脚本
# 1) Tailwind 预编译  2) app.js minify
# 用法: cd build && bash build.sh
set -e
cd "$(dirname "$0")"

echo "[1/3] Tailwind 主页面 CSS..."
npx tailwindcss -c tailwind.main.config.js -i in.css -o ../assets/css/tailwind-main.css --minify

echo "[2/3] Tailwind 角色页 CSS (含 daisyUI)..."
npx tailwindcss -c tailwind.char.config.js -i in.css -o ../assets/css/tailwind-char.css --minify

echo "[3/3] app.js minify..."
node -e "
const esbuild = require('esbuild');
const fs = require('fs');
const src = fs.readFileSync('../assets/js/app.js', 'utf8');
const { code } = esbuild.transformSync(src, { minify: true, target: 'es2020', legalComments: 'none' });
fs.writeFileSync('../assets/js/app.min.js', code);
console.log('app.min.js:', (code.length/1024).toFixed(1), 'KB');
"

echo "构建完成。"
