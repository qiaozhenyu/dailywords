# DailyWords 每日单词

手机优先的英语单词学习 PWA：3500 个日常高频词，每天 10 个，逐字母默写（打字打击感 + 发音 + 音标），随机复习（中英双向），语法学习解锁占位。

- 纯前端、零依赖、零构建，`app/` 目录即完整站点
- 进度存浏览器本地（IndexedDB），可导出备份
- 支持 Docker 局域网部署与任意静态托管

## 本地预览

```bash
npx serve app
# 或
python3 -m http.server 8080 -d app
# 浏览器打开 http://localhost:8080
```

> 提示：若 8080 已被其他程序占用（比如 Docker 端口映射），换一个端口即可，如
> `python3 -m http.server 8090 -d app` → 访问 http://localhost:8090

## 手机使用（Docker 局域网）

```bash
docker compose up -d --build
```
然后手机与电脑连同一 WiFi，浏览器打开 `http://<电脑IP>:8090`，可「添加到主屏幕」当 App 用（PWA，离线可用）。

## 静态部署

把 `app/` 目录整个上传到任意静态托管（GitHub Pages / Netlify / Vercel / nginx 等）即可。

## 部署到 GitHub Pages（免费线上访问，手机电脑都能用）

项目已内置 GitHub Actions 工作流（`.github/workflows/deploy-pages.yml`），推送后自动发布 `app/`。

1. **在 GitHub 新建一个仓库**（Public 即可，**不要**勾选 "Add a README" 等初始化选项）。
2. **本地关联并推送**（在项目目录执行）：

   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git branch -M main
   git push -u origin main
   ```

3. **开启 Pages**：仓库 → Settings → Pages → Source 选 **"GitHub Actions"**。
4. 推送后 Actions 自动构建，几分钟后访问：

   ```
   https://<你的用户名>.github.io/<仓库名>/
   ```

   （电脑/手机浏览器打开，手机上可"添加到主屏幕"当 App 用，首次访问后离线可用。）

> 提示：代码更新后推送即可自动重新部署；浏览器里旧缓存会由 Service Worker 自动清理。
> 若以后想换仓库名/子路径，无需改任何代码（应用全部使用相对路径 + hash 路由）。

## 开发相关（供 AI 工具接手）

- 契约与规格：见 `AGENTS.md`、`docs/SPEC.md`、`docs/PROGRESS.md`
- 生成词库：`node scripts/build-wordlist.mjs`（需网络，ECDICT 数据）
- 生成图标：`node scripts/gen-icons.mjs`
- 测试：`node --test tests/`

## 词库

来自开源 [ECDICT](https://github.com/skywind3000/ECDICT)，按 COCA 词频取前 3500 个日常高频词，含音标与中文释义。
