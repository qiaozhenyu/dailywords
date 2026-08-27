# DailyWords 每日单词 — Agent 开发契约（请先读我）

> 本文件是任何 AI 工具（DeepSeek Harness / Codex / Cursor / Claude Code 等）接手本项目的**入口文档**。
> 接手后请先完整阅读本文件，再读 `docs/SPEC.md`（详细规格）与 `docs/PROGRESS.md`（开发进度）。
> **硬性规则：所有开发决策与进度必须同步到文档，换工具不丢上下文。**

## 1. 项目是什么

一个**纯前端、零依赖、零构建**的英语单词学习 PWA（渐进式 Web 应用）：
- 3500 个日常高频英语单词（COCA 词频排序，带音标与中文释义）。
- 每天学习 10 个新词：卡片展示（英文/音标/中文/发音）→ 逐字母默写（打字打击感：动画+音效+手机震动）。
- 手动复习：随机抽 20 个已学词，支持 中译英（打字）与 英译中（四选一）双向。
- 语法教学：占位模块，累计掌握 500 词后解锁（内容二期填充）。
- 进度存浏览器 IndexedDB（本地数据库，无需服务器），支持导出/导入 JSON 备份。
- 手机端优先：响应式 + PWA（可"添加到主屏幕"）+ 离线可用。
- 部署：Docker（局域网）+ 静态托管（任意静态服务器）双支持。

## 2. 铁律（任何 agent 必须遵守）

1. **零运行时依赖、零构建步骤**：`app/` 目录就是可部署的静态站点，任何静态文件服务器都能直接跑。
   不要引入 npm 包、不要引入打包器、不要引入框架。Node.js 只用于 `scripts/` 下的开发期工具（数据管道、图标生成）。
2. **改动必须同步文档**：功能变更先改 `docs/SPEC.md`，进度变更改 `docs/PROGRESS.md`，再做代码。
3. **风格一致性**：设计令牌（颜色/间距/圆角/字体）只能定义在 `app/styles/tokens.css`，组件不得硬编码颜色值。
4. **数据一致性**：词库数据只由 `scripts/build-wordlist.mjs` 生成 `app/data/words.json`，禁止手工改 JSON。
5. **代码语言**：注释用中文，标识符/文件名用英文。ES Modules（`import`/`export`），2 空格缩进，UTF-8。
6. **不做破坏性改动**：IndexedDB 结构升级必须走版本迁移（见 SPEC §5.2），不得清库重来。

## 3. 技术栈（零依赖承诺的落地方式）

| 领域 | 方案 |
|---|---|
| 界面 | 原生 ES Modules + 手写 CSS（无框架） |
| 路由 | 手写 hash 路由（`#/learn` 等），见 `app/src/router.js` |
| 状态/存储 | IndexedDB（`app/src/db.js` 封装）+ 内存词库（静态 import words.json） |
| 发音 | Web Speech API（`speechSynthesis`，浏览器自带，离线可用） |
| 音效/震动 | WebAudio 振荡器合成音效（无音频文件）+ `navigator.vibrate` |
| PWA | 手写 `manifest.webmanifest` + `app/sw.js`（代码文件网络优先、词库/图标缓存优先，离线可用） |
| 图标 | `scripts/gen-icons.mjs` 用 Node 内置 zlib 手写 PNG 编码生成（无依赖） |
| 测试 | Node 内置 `node --test`（只测纯逻辑模块：取词队列/复习采样/打字判定） |
| 词库 | `scripts/build-wordlist.mjs`：jsDelivr 拉取 COCA 词频序 + CET4 释义 + open_ecdict 兜底 → 生成前 3500 词 |

## 4. 目录结构（接手必读）

```
dailywords/
├── AGENTS.md                 ← 本文件：契约入口
├── README.md                 ← 给用户看的说明（含部署步骤）
├── docs/
│   ├── SPEC.md               ← 详细规格：需求、数据模型、交互规格、部署、路线图（唯一事实来源）
│   └── PROGRESS.md           ← 开发进度日志 + 交接区（接手后先看"当前状态"）
├── app/                      ← 整个目录 = 可部署静态站点
│   ├── index.html            ← 唯一 HTML 入口
│   ├── manifest.webmanifest  ← PWA 清单
│   ├── sw.js                 ← Service Worker（缓存优先）
│   ├── icons/                ← icon.svg / icon-192.png / icon-512.png（脚本生成）
│   ├── styles/               ← tokens.css（设计令牌）/ base.css / components.css / views.css
│   ├── src/
│   │   ├── main.js           ← 启动：注册 SW、初始化 store、挂载应用
│   │   ├── router.js         ← hash 路由
│   │   ├── db.js             ← IndexedDB 封装（进度/设置/统计）
│   │   ├── state.js          ← 全局状态（内存缓存 + 派生数据）
│   │   ├── tts.js            ← 发音（Web Speech API）
│   │   ├── sfx.js            ← WebAudio 音效合成
│   │   ├── haptics.js        ← 手机震动
│   │   ├── typing.js         ← 逐字母打字判定（纯逻辑，可测）
│   │   ├── queues.js         ← 取词/复习采样（纯逻辑，可测）
│   │   └── views/            ← 每视图一个模块：home.js learn.js review.js grammar.js progress.js settings.js
│   └── data/words.json       ← 词库（脚本生成，勿手改）
├── scripts/
│   ├── build-wordlist.mjs    ← 生成 words.json
│   └── gen-icons.mjs         ← 生成 PWA 图标 PNG
├── tests/                    ← node --test 测试（queues.test.js typing.test.js …）
├── Dockerfile                ← nginx 静态服务器镜像
├── docker-compose.yml        ← docker compose up -d 一键起（默认 8090 端口）
├── .dockerignore / .gitignore
```

## 5. 常用命令

```bash
# 本地预览（任选其一，app/ 是静态目录）
npx serve app            # 或
python3 -m http.server 8080 -d app

# 生成词库（需网络，jsDelivr 三个数据源，一次性）
node scripts/build-wordlist.mjs

# 生成图标 PNG
node scripts/gen-icons.mjs

# 跑测试（纯逻辑）
node --test tests/

# Docker 局域网部署
docker compose up -d --build     # 访问 http://<电脑IP>:8090

# 静态部署：把 app/ 整个目录上传到任意静态托管（GitHub Pages/Netlify/nginx 等）即可
```

## 6. 开始开发前

1. 读 `docs/SPEC.md` 全文（重点：§4 数据模型、§5 存储、§6 学习流程、§7 复习流程、§8 交互规格、§9 页面规格）。
2. 读 `docs/PROGRESS.md` 的「当前状态」确认做到哪一步了。
3. 改动后按本文件 §2 更新文档与代码。
