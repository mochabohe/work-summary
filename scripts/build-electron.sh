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

SHARED_LINK="$ROOT_DIR/packages/server/node_modules/@work-summary/shared"

# 如果是软链接或已存在目录，先删除再创建真实目录
if [ -L "$SHARED_LINK" ] || [ -d "$SHARED_LINK" ]; then
  rm -rf "$SHARED_LINK"
fi
mkdir -p "$SHARED_LINK/dist"
mkdir -p "$SHARED_LINK/src"

# 复制 shared 的 package.json
cp "$ROOT_DIR/packages/shared/package.json" "$SHARED_LINK/package.json"

# 复制 shared 的源码和编译产物
cp -r "$ROOT_DIR/packages/shared/src/"* "$SHARED_LINK/src/"
if [ -d "$ROOT_DIR/packages/shared/dist" ]; then
  cp -r "$ROOT_DIR/packages/shared/dist/"* "$SHARED_LINK/dist/"
fi

SHARED_TARGET="$SHARED_LINK"

echo "  ✅ shared 依赖已复制到 server/node_modules/@work-summary/shared"

echo ""
echo "⚡ Step 3: 构建 Electron 主进程"
pnpm --filter @work-summary/electron build

echo ""
echo "📥 Step 4: 打包 Windows 安装程序"
pnpm --filter @work-summary/electron run pack

echo ""
echo "🎉 完成！安装包在 release/ 目录下"
