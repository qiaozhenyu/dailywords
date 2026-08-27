# DailyWords 每日单词 — 开发进度（PROGRESS）

> 交接第一站：任何 agent 接手先看 **§1 当前状态** 与 **§2 交接须知**，再读 `AGENTS.md` 与 `SPEC.md`。

## 1. 当前状态

- **阶段**：Phase 1 核心功能已完成，待用户试用反馈
- **最新完成**：
  - [x] 契约文档三件套（AGENTS.md / SPEC.md / PROGRESS.md）
  - [x] 词库数据管道：COCA 词频序 + CET4 主释义 + open_ecdict 兜底 → `app/data/words.json`（3500 词，0 空释义，音标缺 5）
  - [x] 核心模块全部实现：db（IndexedDB）/ state / router / tts（发音）/ sfx（音效）/ haptics（震动）/ typing（打字引擎）/ queues（取词与复习采样）/ ui（字母格组件）
  - [x] 六个视图：home / learn（每日学习流）/ review（中英双向复习）/ grammar（语法占位+解锁）/ progress（统计+7日图）/ settings（全部设置+备份）
  - [x] 样式：tokens（亮/暗双主题）/ base / components（含打字打击感动画、粒子庆祝）/ views
  - [x] PWA：manifest + sw.js（缓存优先离线可用）+ 图标（脚本生成 PNG/SVG）
  - [x] Docker：Dockerfile + docker-compose（8090 端口）
  - [x] 测试：18 个用例全过（node --test）
  - [x] 冒烟测试：静态服务器下全部资源 200
- **进行中 / 待办**：
  - [ ] 用户浏览器实测（重点：打字打击感、发音、手机端体验）
  - [ ] 可选：git init + 首次提交（便于版本化交接）
  - [ ] 二期功能（见 SPEC §14 路线图）

## 2. 交接须知（换 agent 必读）

1. 铁律见 `AGENTS.md` §2（零依赖、改文档再改代码、tokens 唯一颜色源、words.json 禁手改）。
2. 详细规格以 `docs/SPEC.md` 为准；与代码冲突时**以 SPEC 为准**，冲突即 bug，修代码或改 SPEC 都要记录。
3. 本文件「进行中」列表是当前任务的 todo 源头；每完成一项就把它勾掉并追加到「变更日志」。
4. 若上次开发中断，从「进行中」第一项继续，别重复已完成工作。

## 3. 变更日志

### 会话 19（中文释义只取一个 + 进度页已学单词列表，用户需求）
- **学习卡释义精简**：`pos.firstMeaning` 只取第一个义项（分号/编号/词性组分隔），
  学习/无限/复习中译英的卡片中文行显示单一释义；新增 4 组测试。
- **进度页已学单词列表**：A-Z 排序、**完整中文释义**（与学习卡不同）、搜索框过滤、
  点击行发音（事件委托，无 3500 个监听器）。SPEC §9.2/§9.5 同步更新。

### 会话 18（在线语音提示，用户环境诊断）
- 用户发现发音无声是因未开 VPN（浏览器走 Google 在线语音）。
- 设置页新增：当前语音为在线合成（Google / Microsoft Online）时显示黄色提示
  "可能需要科学上网，可换本地语音"；`tts.isVoiceRemote()` 暴露检测。

### 会话 17（线上发音完全无声，用户反馈"点击和空格都没声音"）
- **根因分析**：点击/空格都没声音 → 不是按键处理问题，是 TTS 引擎层静默失败。
  最可能是 Chrome 已知 bug：`getVoices()` 返回的 voice **对象引用在语音列表加载后失效**，
  用陈旧引用 `speak()` 会无声无错。
- **修复（tts.js 重写）**：
  1. 只保存 `voiceURI` 字符串，**每次 speak 前重新 getVoices() 解析 fresh 引用**；
  2. 静默失败兜底：speak 后 200ms 检测未开始播放则自动重试一次；
  3. 不支持 TTS 时 toast 提示（不再静默）。
- SPEC §10 同步更新。

### 会话 16（线上问题：<kbd> 字面量 + 空格不发音，用户反馈）
- **`<kbd>` 字面量**：复习页 4 处快捷键提示用 `el()` 传 HTML 字符串被转义成纯文本。
  新增 `ui.kbdHint(html)`（innerHTML 渲染），复习页全部改用。
- **空格不发音**：部分浏览器 Space 的 `e.key` 是 `"Spacebar"` 而非 `" "`，判断不匹配。
  新增 `ui.isSpaceKey(e)` 兼容两者，学习/复习/无限模式全部改用。
- 已通过 GitHub 数据 API 部署上线并验证（`isSpaceKey`/`kbdHint` 线上确认）。

### 会话 15（无限模式，用户需求）
- 新增「⚡ 无限模式」（`#/infinite`，首页卡片入口）：全词库随机出题、看中文打英文、
  答对 +10 分 × 连击倍率（≥5 连击 ×2、≥10 连击 ×3）、无限答题、随时结算。
- 最高分持久化（kv `infiniteBest`），首页显示"最高 X 分"；结算页显示得分/正确率/最高连击/用时。
- 快捷键：Space 发音、Esc 结束/回首页、结算页 Enter 再来一局。
- 部署：本地 git push 因网络限速不可用，更新经 GitHub 数据 API 上传。

### 会话 14（复习中译英去掉例句，用户反馈）
- 复习·中译英提示区只保留词性标签+中文释义，不显示例句（纯回忆）；学习页例句保留。

### 会话 13（词性标签显示 undefined，用户反馈）
- **根因**：`parsePos` 返回数组但视图按对象取 `.icon/.label` 属性 → undefined。
- **修复**：`parsePos` 改为返回 `{code, label, icon}` 对象（与 JSDoc 一致）；
  新增 `tests/pos.test.js`（8 组用例）防回归。

### 会话 12（学习卡四行布局 + 例句数据，用户反馈）
- **布局**：学习卡改为四行结构、颜色各异——① 中文行（最上）：词性标签（图标+中文词性，
  `pos.js` 解析翻译前缀）+ 词义文字（字号较小）；② 英文行（中间，主蓝大字号）；③ 音标行
  （灰色）；④ 示例短句行（绿色斜体带引号）。发音按钮在音标与示例之间；打字阶段打字区替换
  英文行位置（中文/音标/例句不动）；复习中译英提示同款（词性标签+例句）。
- **例句数据**：Tatoeba 官方源不可用（4KB/s），改用 **WordNet 3.0**（NLTK 打包，jsDelivr
  下载）词义 gloss 例句，`scripts/extract_examples.py` 提取（完整句优先、片段兜底，需含
  目标词独立出现，3-9 词）。覆盖 2398/3500 词（功能词无例句自动隐藏该行）。
- 数据管道 build-wordlist.mjs 增加例句合并步骤；SPEC §4.1/§9.2/§13 同步更新。

### 会话 11（默写时显示中文，用户反馈）
- 开始默写后**中文释义保持可见**（只隐藏英文），变成「看中文→打英文」的回忆测试；
  「显示答案」仅展示英文。SPEC §6.2 同步更新。

### 会话 10（体验修复：乱码/复习发音/焦点/一屏布局）
- **乱码修复**：`el()` 对嵌套数组 children 处理 bug（首页按钮的 `["开始学习", kbd]` 被
  stringify 成 "[object Object]" 一类文字）。`el()` 改用 `flat(Infinity)` 自动展平；
  首页按钮结构改为扁平数组。
- **复习空格发音**：中译英模式补上 `Space` 发音快捷键（与按钮一致）；学习打字阶段
  Space 不再因输入框聚焦而跳过——Space 任何情况都发音（空格本就不能输入）。
- **发音后焦点**：点击发音（学习/复习中译英）后自动 `typing.focus()`，可直接继续打字，
  不用再按一次。
- **一屏布局**：学习/复习会话 `learn-root` 高度自适应视口（`100dvh` 计算）、卡片 flex 占满
  剩余高度、顶部/圆点/选项间距收紧；无 Tab 栏页面 `app-main.no-tabbar` 减少底部留白；
  首页紧凑化（hero/卡片内边距缩小）。设置页等长表单页仍允许滚动（"尽量"）。

### 会话 9（视觉改版：句乐部 Earthworm 风格，用户选定）
- 用户参考 [Earthworm](https://github.com/cuixueshe/earthworm)（句乐部）后确定最终风格方向。
- **研究**：分析其源码（tailwind 配置、globals.css、QuestionInput/Answer/Tips/Summary 组件），
  提取设计语言：纯白/`#05051d` 深蓝黑底、Nunito 圆润字体、下划线打字区（活动词 fuchsia、
  错误红+shake、默认灰下划线）、主蓝 `#4e80ee`、wink 光标闪烁、柔和阴影、键盘驱动。
- **移植实现**：
  - Nunito-Bold.ttf（OFL 开源协议）本地打包，@font-face 挂载，拉丁字母全站生效。
  - tokens.css 换 Earthworm 配色（亮：白底/`#0a0a0a`/`#4e80ee`；深：`#05051d`）。
  - 打字区重构：字母格子 → **下划线大字母**（敲对绿、当前位粉紫 wink 光标、敲错红 + shake
    translate3d ±1/2/4px）；`ui.js` renderState 增加 cursor 状态。
  - 学习卡去卡片化（无边框无阴影纯文字居中，与 Earthworm 一致）。
  - 图标/主题色换 Earthworm 蓝 `#4e80ee`；SW 升 `dw-v5` 并预缓存字体。
- 引用注意：仅借鉴视觉风格与交互模式（MIT 项目），字体为 OFL 协议可自由使用。

### 会话 8（视觉改版：极简留白风，用户选定方向）
- 用户选定「路线 A：极简留白风」（参考不背单词 / Lingvist）。
- **tokens.css 全面重做**：暖白底 `#fafaf9`、单一茶绿强调色 `#0d9488`、大圆角
  （10/16/24px）、轻柔弥散阴影、间距留白加大；深色模式同步；新增 `--font-size-3xl`。
- **组件精修**（components.css）：按钮大圆角/按压色、卡片大圆角细边框、进度条变细、
  字母格细边框大圆角、选项 hover 描边、表单 focus 强调色。
- **布局留白**（base.css/views.css）：头部去分割线、主内容边距加大、首页大数字 56px、
  单词展示 56px（桌面 64px）、学习卡加高。
- 品牌一致性：manifest/index theme-color、App 图标全部换为茶绿色系（脚本重生成）。
- SW 缓存升 `dw-v4`（图标为缓存优先，需清旧缓存才能看到新图标）。

### 会话 7（Enter 后"执行一半"——参数缺失 bug）
- **根因**：上一轮修复作用域后，键盘处理器调用 `toTypePhase()` **漏传了 `word` 参数**
  （按钮点击传了，键盘没传）→ `word.word` 抛 TypeError → 单词/中文已隐藏（前两句执行），
  但打字区创建、按钮替换没执行 → 用户看到"隐藏了但按钮还在、无法输入"。
- **修复**：键盘 Enter 改为 `toTypePhase(currentWord())`；`toTypePhase` 开头先校验
  `word` 再改状态（参数校验在任何状态修改之前，杜绝"执行一半"坏状态）；键盘异常改为
  toast 提示（不再静默吞错）。
- 代码审查确认全部调用点参数齐全（toTypePhase/onReveal/onWordDone/pick/start 等）。

### 会话 6（回车仍无效——作用域 bug 根因修复）
- **根因**：`toTypePhase` 定义在 `showWord` 函数内部，而键盘处理器 `onKey` 在 `showWord`
  外层作用域调用它 → 运行时 `ReferenceError`，被 try/catch 吞掉 → 按 Enter 毫无反应。
  这是"开始默写回车没用"的真正根因（第一版就存在，try/catch 反而掩盖了错误）。
- **修复**：`toTypePhase(word)` 提升到 renderLearn 作用域（用 `card.querySelector` 定位元素），
  按钮 onclick 改为 `toTypePhase(word)`；SW 缓存升 `dw-v3` 强制推送。
- **教训（写进 SPEC §9.7）**：键盘处理器引用的动作函数必须定义在视图根作用域；
  避免"内层函数被外层引用"的静默失败。

### 会话 5（Service Worker 缓存修复，用户反馈"letter-cells 还在显示字母"）
- **根因**：SW 旧策略为全量缓存优先（缓存名 dw-v1 一直未变），浏览器一直从缓存读**初始版本**
  的代码——字母格显示字母的旧版、没有快捷键的旧版。此前的多次修复（空白字母格、桌面布局、
  快捷键等）实际从未推送到用户浏览器。
- **修复**：缓存版本升到 `dw-v2`（activate 清旧缓存）；fetch 策略改为**代码文件网络优先**、
  词库/图标缓存优先——以后迭代刷新即生效，不再需要手动清缓存。
- 用户看到新版后需刷新两次（或 Cmd+Shift+R 一次）完成 SW 更新。

### 会话 4（快捷键按钮化 + 加固，用户反馈"开始默写回车没用"）
- **快捷键印到按钮上**：所有绑定快捷键的按钮显示 kbd 徽章（开始默写 ⏎、显示答案 Esc、
  发音 Space、复习选项 1-4、再复习一轮 Enter 等），底部提示条保留。
- **回车可靠性加固**：键盘动作不再依赖音效（音效异常不再吞掉动作）；处理器 try/catch 兜底；
  `toTypePhase`/`onReveal` 增加 `phase` 幂等守卫，防「按钮聚焦 + Enter」双触发导致状态错乱。
- 复习四选一选项用 `dataset.value` 匹配正确答案（kbd 徽章不再干扰文本对比）。

### 会话 3（发音体验，用户反馈）
- **默认发音更标准**：`tts.js` 增加自然发音优先名单（Google/Microsoft 自然音、Samantha、
  Victoria 等）与语音偏好（auto 美音优先 / en-US / en-GB），默认不再随机取首个 en 语音。
- **切换立即生效**：修复设置里换语音需刷新才生效的 bug（切换时重新 `initTTS`）。
- **设置页发音区升级**：语音偏好下拉、语音下拉（含当前语音）、🔊 试听按钮、刷新列表、
  当前语音名显示（`settings.js` + `views.css` `.voice-row`）。
- SPEC §4.2/§9.6/§10 同步更新。

### 会话 2（桌面端体验迭代，用户反馈）
- **桌面布局**：≥768px 宽屏内容区加宽到 960px、底部 Tab 变顶部横向导航、首页卡片双列网格、
  统计卡片三列、学习卡片加大（`base.css`/`views.css` 媒体查询，SPEC §9）。
- **复习默写不再暴露答案**：字母格改为初始空白、敲对才显示字母（修复照抄问题），
  「显示答案」用 `reveal()` 亮格展示（`ui.js`，SPEC §8.1/§7）。
- **键盘快捷键**：首页 Enter；学习 Enter/Space/Esc/R；复习模式 1/2、英译中 1-4/Space/Esc、
  中译英 Esc、结束页 Enter/Esc（`home.js`/`learn.js`/`review.js`，SPEC §9.7）。
- **视图生命周期清理**：router 支持视图 `destroy` 钩子，视图卸载时移除 keydown 监听、
  清理 setTimeout 与打字组件（`router.js`），杜绝监听器泄漏与定时器误触发。

### 会话 1（Phase 1 核心交付）
- 与用户确认全部需求（见 SPEC §2），确立「契约文档驱动」开发方式。
- 撰写 AGENTS.md / SPEC.md / PROGRESS.md。
- 完成零依赖 PWA 全部核心功能（详见 §1）。
- **数据管道关键决策**：GitHub release（ECDICT sqlite/csv）与 raw.githubusercontent 在本机网络不可用
  （限速/被墙），最终采用 jsDelivr CDN 三源方案（COCA_20000 + CET4_edited + open_ecdict），
  实测速度 ~2MB/s，可复现。质量：COCA top3500 覆盖 100%，CET4 释义占 84%。
  若后续网络可用，可把数据源切回 ECDICT（frq 更权威），改动点集中在 `scripts/build-wordlist.mjs` 与 SPEC §13。

## 4. 技术备忘

- 本地预览：`npx serve app` 或 `python3 -m http.server 8080 -d app`。
- 词库生成：`node scripts/build-wordlist.mjs`（需网络，三源缓存于 `.cache/`）。
- 图标生成：`node scripts/gen-icons.mjs`。
- 测试：`node --test`（自动发现 tests/）。
- Docker：`docker compose up -d --build`，端口 8090。
- 冒烟测试命令：起静态服务器后逐资源 curl 200。
