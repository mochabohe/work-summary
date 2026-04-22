# @work-summary/website

智能工作总结项目的官方介绍站点（纯静态 HTML + Tailwind CDN）。

## 本地预览

```bash
pnpm --filter @work-summary/website dev
# 打开 http://localhost:5180
```

或者直接用浏览器打开 `index.html` 也行。

## 需要手动替换的内容

在 `index.html` 底部的脚本块里统一配置：

```js
const GITHUB_REPO    = 'REPLACE_ME/work-summary';
const LATEST_VERSION = 'v1.0.0';
const WIN_ASSET      = '智能工作总结-Setup-1.0.0.exe';
```

- `GITHUB_REPO`：改成你真实的 GitHub 仓库（`用户名/仓库名`）
- `LATEST_VERSION`：对应 `packages/electron/package.json` 里的 version，发版时同步
- `WIN_ASSET`：electron-builder 产出的安装包文件名（在 `release/` 目录下查看）

Footer 里还有两处 `REPLACE_ME/work-summary` 链接需要同步修改。

## 放产品截图

在 `packages/website/screenshots/` 下放 4 张图，命名：
- `home.png`
- `generate.png`
- `analysis.png`
- `preview.png`

没放也不会报错，会显示占位色块。建议 16:9 比例，宽度 ≥ 1280。

## 部署

纯静态站点，扔到任何静态托管即可：
- GitHub Pages：把 `packages/website` 内容推到 `gh-pages` 分支
- Vercel / Netlify：Root Directory 指到 `packages/website`，Build Command 留空，Output Directory 填 `.`
- 自己服务器：把整个目录丢到 Nginx `root` 下即可
