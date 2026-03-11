#!/bin/bash
# build-electron.sh - 构建 Electron 桌面应用
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "📦 Step 1: 构建所有 packages (shared → server → client)"
pnpm build

echo ""
echo "🔗 Step 2: 处理 workspace 依赖 (把 @work-summary/shared 复制到 server 的 node_modules)"
# 打包后 server 需要能 resolve @work-summary/shared
# pnpm workspace 用的是 symlink，打包后会断掉
# 所以需要把 shared 的产物复制成真实文件

SHARED_TARGET="$ROOT_DIR/packages/server/node_modules/@work-summary/shared"
mkdir -p "$SHARED_TARGET/dist"
mkdir -p "$SHARED_TARGET/src"

# 复制 shared 的 package.json
cp "$ROOT_DIR/packages/shared/package.json" "$SHARED_TARGET/package.json"

# 复制 shared 的源码和编译产物
cp -r "$ROOT_DIR/packages/shared/src/"* "$SHARED_TARGET/src/"
if [ -d "$ROOT_DIR/packages/shared/dist" ]; then
  cp -r "$ROOT_DIR/packages/shared/dist/"* "$SHARED_TARGET/dist/"
fi

echo "  ✅ shared 依赖已复制到 server/node_modules/@work-summary/shared"

echo ""
echo "⚡ Step 3: 构建 Electron 主进程"
pnpm --filter @work-summary/electron build

echo ""
echo "📥 Step 4: 打包 Windows 安装程序"
pnpm --filter @work-summary/electron pack

echo ""
echo "🎉 完成！安装包在 release/ 目录下"
