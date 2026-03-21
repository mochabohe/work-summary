#!/bin/bash
# build-electron.sh - 构建 Electron 桌面应用
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "📦 Step 1: 构建所有 packages (shared → server → client)"
pnpm build

echo ""
echo "🔗 Step 2: 处理 workspace 依赖 (把 @work-summary/shared 复制到 server 的 node_modules)"
SHARED_LINK="$ROOT_DIR/packages/server/node_modules/@work-summary/shared"
if [ -L "$SHARED_LINK" ] || [ -d "$SHARED_LINK" ]; then
  rm -rf "$SHARED_LINK"
fi
mkdir -p "$SHARED_LINK/dist"
mkdir -p "$SHARED_LINK/src"
cp "$ROOT_DIR/packages/shared/package.json" "$SHARED_LINK/package.json"
cp -r "$ROOT_DIR/packages/shared/src/"* "$SHARED_LINK/src/"
if [ -d "$ROOT_DIR/packages/shared/dist" ]; then
  cp -r "$ROOT_DIR/packages/shared/dist/"* "$SHARED_LINK/dist/"
fi
echo "  ✅ shared 依赖已复制到 server/node_modules/@work-summary/shared"

echo ""
echo "📦 Step 2.5: 用 esbuild 将 server 打包为单文件 bundle（消除 node_modules 依赖）"
ESBUILD="$ROOT_DIR/node_modules/.pnpm/esbuild@0.27.4/node_modules/esbuild/bin/esbuild"
# 如果找不到指定版本，尝试找任意版本
if [ ! -f "$ESBUILD" ]; then
  ESBUILD=$(find "$ROOT_DIR/node_modules/.pnpm" -path "*/esbuild/bin/esbuild" | head -1)
fi
"$ESBUILD" \
  "$ROOT_DIR/packages/server/dist/index.js" \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile="$ROOT_DIR/packages/server/server.cjs" \
  --external:fsevents \
  --banner:js="const __importMetaUrl = require('url').pathToFileURL(__filename).href;"  \
  --define:'import.meta.url'='__importMetaUrl'
echo "  ✅ server.cjs bundle 已生成"

echo ""
echo "⚡ Step 3: 构建 Electron 主进程"
pnpm --filter @work-summary/electron build

echo ""
echo "📥 Step 4: 打包 Windows 安装程序"
pnpm --filter @work-summary/electron run pack

echo ""
echo "🎉 完成！安装包在 release/ 目录下"
