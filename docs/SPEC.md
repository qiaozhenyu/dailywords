# DailyWords 每日单词 — 详细规格（SPEC）

> 本文档是项目的**唯一事实来源**。任何功能变更必须先改这里，再改代码。
> 配套文档：`../AGENTS.md`（开发契约）、`../docs/PROGRESS.md`（进度日志）。

## 1. 产品概述

DailyWords 是一款手机优先的英语单词学习 PWA：

- **词库**：3500 个日常高频词（COCA 词频排序，带音标 + 中文释义）。
- **每日学习**：每天 10 个新词（数量可调），按词频从常用到生僻推进，当天 10 个随机打乱出现；
  当天没背完的自动顺延到下一天。
- **学习方式**：卡片展示（英文 / 音标 / 中文 / 发音按钮）→ 逐字母默写输入（打字打击感：
  字母逐个亮起的动画 + 按键音效 + 手机震动；错误字母红色抖动提示）。
- **复习**：手动触发，从已学词中随机抽 20 个（数量可调），支持「英译中」（四选一选择题）
  与「中译英」（打字默写）双向；答错的词进错词本并在本轮末尾重出。
- **语法教学**：占位模块，累计掌握 500 词后解锁（阈值可调），内容二期填充（句子 → 文章）。
- **数据**：进度全部存浏览器 IndexedDB（本地数据库），支持导出/导入 JSON 备份。
- **部署**：Docker 局域网 + 任意静态托管双支持。零后端、零费用。

## 2. 需求确认记录（2024 用户拍板，勿改）

| 项 | 决定 |
|---|---|
| 学习节奏 | 每天 10 个新词；当天未完成可顺延到下一天（不强制当天清完） |
| 使用范围 | 仅自己使用，不需要账号/服务器 |
| 词表 | 公开高频词表，按词频从常用到生僻推进 |
| 发音 | 浏览器自带语音合成（Web Speech API） |
| 复习 | 手动复习按钮 → 随机抽 20 个已学词；学得多了之后可升级为句子复习（二期） |
| 存储 | 浏览器本地数据库（IndexedDB），可导出备份；无需服务器 |
| 语法 | 先做占位 + 解锁门槛，内容二期再填 |
| 部署 | 先 Docker 局域网；保留任意静态托管能力 |
| 文档 | 契约文档优先，进度同步，任何 agent 可接手继续开发 |

## 3. 架构决策（ADR 摘要）

- **ADR-1 零依赖纯静态**：不引入 npm 运行时依赖与构建工具。理由：任意 agent 可零成本接手、
  无版本漂移、部署方式最多（静态目录 + nginx 即可）。
- **ADR-2 手写 hash 路由**：视图切换用 `location.hash`，天然支持静态部署与 PWA（无需服务器重写规则）。
- **ADR-3 IndexedDB 存进度、内存存词库**：3500 词（约 400KB）随 JS 模块静态加载，一次入内存；
  用户进度（已学/错词/设置/统计）存 IndexedDB。
- **ADR-4 Web Speech API 发音**：浏览器自带 TTS，免费、离线（系统语音）、零音频文件。
  预留真人发音替换接口（words.json 可加 `audio` 字段，二期）。
- **ADR-5 WebAudio 合成音效 + navigator.vibrate**：打字打击感不依赖任何音频资源文件。
- **ADR-6 数据管道独立脚本**：词库只由 `scripts/build-wordlist.mjs` 从 ECDICT 生成，可复现。

## 4. 数据模型

### 4.1 词库 `app/data/words.json`

由 `scripts/build-wordlist.mjs` 生成（禁止手改）。结构：

```json
{
  "meta": {
    "source": "COCA 20000 (词频序) + CET4 (主释义) + open_ecdict (兜底)",
    "order": "frq ascending (most frequent first)",
    "count": 3500,
    "examples": 3350,
    "generatedAt": "2025-01-01T00:00:00.000Z"
  },
  "words": [
    { "word": "the", "phonetic": "/ðə/", "translation": "art. 这；那", "frq": 1, "example": "The cat is on the mat." }
  ]
}
```

- `word`：英文单词（唯一，作为 ID）。
- `phonetic`：国际音标（可空字符串，前端为空时隐藏音标行）。
- `translation`：中文释义（可含词性前缀，如 "n. 苹果"；必非空）。
- `frq`：COCA 当代语料库词频位次（数字越小越常用；生成时按此升序排列）。
- `example`：英文示例短句（来自 WordNet 3.0 词义例句；可缺失，缺失时前端隐藏例句行）。

生成规则（详见 §13）：过滤掉无中文释义的条目；按 `frq` 升序取前 3500；
`frq` 缺失的用 `bnc` 兜底，仍缺失的排最后。

### 4.2 IndexedDB `dailywords` 库（版本 v1）

**store `progress`**（keyPath: `wordId`）——每词一条学习记录，只有学过的词才有记录：

```js
{
  wordId: "apple",            // = words.json 中的 word
  status: "learned",          // 仅 "learned"（学过=默写通过过至少一次）；没记录的词=未学
  learnedAt: 1735689600000,   // 首次掌握时间戳(ms)
  correctCount: 5,            // 累计答对次数（默写/复习）
  wrongCount: 1,              // 累计答错次数（>0 即进错词本）
  lastSeenAt: 1735690000000,  // 最后一次出现时间戳
  reviewCount: 3              // 被复习次数
}
```

**store `kv`**（keyPath: `key`）——键值存储：

| key | 结构 | 说明 |
|---|---|---|
| `settings` | `{ dailyQuota: 10, reviewCount: 20, voiceURI: "", voicePreference: "auto", rate: 0.9, pitch: 1.0, sfxOn: true, hapticsOn: true, autoSpeak: true, grammarUnlockAt: 500 }` | 用户设置，默认值如上（voicePreference: `auto`/`en-US`/`en-GB`） |
| `session` | `{ date: "2025-01-01", learnedToday: ["apple", ...], sessionActive: false }` | 今日学习会话状态（`date` 为本地时区 YYYY-MM-DD） |
| `stats` | `{ totalLearned: 120, totalReview: 45, wrongTotal: 8, bestStreak: 3 }` | 累计统计（派生值，写入以保持简单） |
| `meta` | `{ schemaVersion: 1, installedAt: 1735689600000 }` | 库元信息 |

### 4.3 派生概念

- **已学数** = progress store 中 status 为 `learned` 的记录数。
- **错词本** = progress 中 `wrongCount > 0` 的词。
- **未学池** = words.json 中无 progress 记录的词（按 frq 升序 = 文件顺序）。
- **连续天数（streak）**：当天学过 ≥1 词则 streak+1；断一天则重置为 1。统计口径见 §11。

## 5. 存储层（`app/src/db.js`）

- 对外 API（全部返回 Promise）：`init()`、`getProgress(wordId)`、`setProgress(rec)`、
  `getAllProgress()`、`getKv(key)`、`setKv(key, val)`、`exportBackup()`、`importBackup(json)`、`clearAll()`。
- `init()` 在启动时调用；升级采用版本号迁移（`onupgradeneeded`），铁律 §2.6：不做破坏性清库。
- 备份 = `{ app: "dailywords", schemaVersion, exportedAt, progress: [...], kv: {...} }`；
  导入时整体替换并重建索引。
- 设置项在内存缓存一份（`state.js`），写操作同时写 IDB（写入失败降级为内存，不阻塞使用）。

## 6. 每日学习流程（`app/src/views/learn.js` + `queues.js`）

### 6.1 取词（`queues.js` 纯函数，可测）

```
getNextBatch(quota, words, learnedIds, rng=Math.random):
  unseen = words.filter(w => !learnedIds.has(w.word))     // 文件顺序 = frq 升序
  batch  = unseen.slice(0, quota)                          // 取前 quota 个
  return shuffle(batch, rng)                               // 当天随机打乱
```

- 未学完的词没有 progress 记录 → 仍在未学池里 → 下一次取词自然排到（**顺延机制**，无需额外逻辑）。
- 剩余不足 quota 时取尽（学习完成 = 全部 3500 词已学，首页显示"词库学完 🎉"）。

### 6.2 单个词的学习交互（学习模式 LearnMode）

每词两步：

1. **看（Look）**：卡片显示英文大词 + 音标 + 中文释义 + 发音按钮（喇叭）。
   若设置 `autoSpeak` 开启，卡片出现时自动发音。
   按钮「开始默写」→ 进入打字步骤（英文先隐藏，避免照抄）。
2. **打（Type）**：输入框 + 逐字母反馈（见 §8）。**英文隐藏避免照抄，中文释义保持可见**
   （看中文、默写英文）。默写正确 → 该词标记 `learned`，
   更新 `session.learnedToday`、`stats`；自动播放完成庆祝 → 900ms 后进下一个词。
   点「显示答案」→ 展示英文并跳过（该词不标记 learned，本轮稍后重新出现）。

- 单次会话（session）内：本轮 10 词列表保存在内存，已过词不重复；「显示答案」跳过的词
  追加到本轮末尾（最多重来 2 次后直接放行，防止死循环）。
- 会话中退出（切 tab 或刷新）：本轮进度丢失，但已 learn 的词已入库；未学的仍在未学池，
  下次进入重新取词（顺延）。
- 会话结束页：本轮结果（学会 X / 跳过 Y）、「明天再来」与「去复习」按钮。

## 7. 复习流程（`app/src/views/review.js`）

- 入口：首页「复习」按钮或底部 Tab。进入先选模式：**英译中**（四选一）或 **中译英**（默写）。
- 采样（`queues.js` 纯函数，可测）：
  ```
  sampleReview(count, learnedWords, wrongWordIds, rng=Math.random):
    wrong = shuffle(wrongWordIds ∩ learned, rng)
    take  = min(ceil(count * 0.3), wrong.length)          // 最多 30% 来自错词本
    rest  = shuffle(learned 排除 wrong 已取部分, rng)
    return shuffle(wrong[0..take] + rest[0..count-take], rng)
  ```
- **英译中**：显示英文 + 音标 + 发音；4 个中文释义选项（1 正确 + 3 个从其他已学词随机取的干扰项）。
  选对：绿闪 + 音效，`correctCount+1`；选错：红闪 + 展示正确答案，`wrongCount+1`，
  并把该词追加到本轮末尾（最多 2 次）。点击词可听发音。
- **中译英**：显示中文释义，默写英文（复用 §8 打字引擎；**字母格初始空白**，不显示目标词字母，
  杜绝照抄）。「显示答案」→ 格子亮起展示完整单词（计入跳过），本轮末尾重出（最多 2 次）。
- 结束页：得分统计（对/错/正确率）、「再复习一轮」。
- **二期升级点（已预留，勿删）**：句子复习模式——接口 `sentencePool` 字段与视图占位，
  数据源二期补充（见 §14 路线图）。

## 8. 打字打击感规格（`app/src/typing.js` + `sfx.js` + `haptics.js`）

### 8.1 视觉（CSS 动画）

- 目标词拆成字母格子显示在输入框上方。**格子初始为空白**（不显示目标字母），
  敲对后该格才显示字母并变绿——保证默写是真正的记忆测试（学习与复习中译英均如此）。
- 每敲对一个字母：该格显示字母、变绿并做「弹出」动画（scale 1 → 1.15 → 1，约 120ms）。
- 敲错字母：**不接收**该字符（输入内容不前进），当前格子红闪 + 整词抖动（shake 200ms）。
- 点「显示答案」：所有格子亮起显示完整单词（`reveal()`），随后进入下一词。
- 全词完成：所有格子绿 + 整词闪光，卡片上飘出小型粒子（CSS 关键帧，约 20 个粒子）。
- 连续正确 5 格时额外触发一次连击光效（简单辉光）。

### 8.2 音效（WebAudio 合成，无音频文件）

| 事件 | 波形/频率 | 时长 |
|---|---|---|
| 正确按键 | sine 660Hz | 45ms |
| 连击(≥5) | sine 880Hz | 60ms |
| 错误按键 | square 130Hz | 90ms |
| 单词完成 | 两个音：sine 660→990Hz 依次 | 各 120ms |
| 复习答对 | sine 523→784Hz | 各 100ms |
| 复习答错 | square 150Hz | 120ms |

实现：`AudioContext` 懒初始化（首次用户交互时创建，符合浏览器自动播放策略）；
`sfxOn` 为 false 时全部静默。播放用振荡器 + gain 包络（attack 5ms / release 40ms）。

### 8.3 震动（`navigator.vibrate`，仅移动端有效）

| 事件 | 模式 |
|---|---|
| 正确按键 | `10` |
| 错误按键 | `[30, 50, 30]` |
| 单词完成 | `[20, 40, 20, 40, 80]` |

`hapticsOn` 为 false 时跳过；无 `navigator.vibrate` 的环境静默降级。

## 9. 页面规格（`app/src/views/*.js`）

**视觉风格（会话 9 确定）**：句乐部（[Earthworm](https://github.com/cuixueshe/earthworm)，MIT）极简打字风——
纯白底（深色模式 `#05051d` 深蓝黑）、大字号 Nunito 圆润字体（OFL 协议，本地打包）、
下划线打字区（敲对绿、当前位粉紫闪烁光标、敲错红+抖动）、主按钮蓝 `#4e80ee`、
柔和阴影、键盘驱动。所有颜色/圆角/间距只能来自 `tokens.css`（铁律 §2.3）。

**响应式**：手机优先；`≥768px` 宽屏（桌面/平板横屏）自动切换桌面布局——内容区加宽到 960px、
底部 Tab 栏变为顶部横向导航条、首页卡片与统计卡片改用多列网格。桌面端（`(hover:hover) and
(pointer:fine)`）显示键盘快捷键提示条（kbd 样式）。

底部 Tab 栏（5 个）：**今日 / 复习 / 语法 / 进度 / 设置**。学习/复习会话进行时隐藏 Tab 栏。

### 9.1 今日（home.js）`#/`
- 顶部：应用名 + 连续天数徽章（🔥 N 天）。
- 「今日学习」卡片：今日进度（已学 X / 今日 10）、主按钮「开始学习」或「继续学习」
  （今日 session 有未完成批次时显示继续）。
- 「复习」卡片：错词本数量、快捷按钮「开始复习」。
- 若全部 3500 词已学：显示完成横幅「词库学完 🎉」。
- 若已学数 ≥ grammarUnlockAt：语法卡片显示「已解锁 →」。

### 9.2 学习会话（learn.js）`#/learn`
- 顶部进度条（当前第 N / 10）+ 10 个圆点指示器。
- 卡片区四行布局（颜色各不相同）：
  1. **中文行**（最上）：词性标签（图标+中文词性，如 "📗 名词"，`pos.js` 解析）+ **第一个义项**文字
     （`pos.firstMeaning`：分号/编号/词性组只取第一项，避免一次显示多个意思）；
  2. **英文行**（中间）：大字号主蓝（`--color-primary`）；
  3. **音标行**：灰色等宽字体；
  4. **示例短句行**（最下）：绿色斜体，带引号（`example` 字段，缺失则隐藏该行）。
  发音按钮在音标与示例之间；打字阶段打字区（下划线字母）替换英文行位置，中文/音标/例句保持不变。
- 结束页：结果统计 + 按钮。

### 9.3 复习（review.js）`#/review`
- 模式选择页（英译中 / 中译英）→ 会话页（题干 + 4 选项 或 默写输入）→ 结束页（得分）。

### 9.4 语法（grammar.js）`#/grammar`
- 未解锁（已学 < grammarUnlockAt）：锁形图标 + 「累计掌握 N 词解锁语法学习」+ 进度条（已学/阈值）。
- 已解锁：课程列表占位卡片——「① 简单句入门」「② 复合句进阶」「③ 段落阅读」「④ 文章精读」，
  每张卡片标注「内容二期填充」，点击弹 toast「课程内容开发中」。

### 9.5 进度（progress.js）`#/progress`
- 统计卡片：已学 / 3500、今日已学、累计复习、错词数、连续天数、最佳连续。
- 近 7 日学习柱状图（CSS 画，无图表库）：每日新学词数。
- 词库已学比例进度条。
- **已学单词列表**：所有已学词（A-Z 排序），**显示完整中文释义**（与学习卡的第一义项不同），
  支持搜索框过滤、点击行发音（事件委托）。

### 9.6 设置（settings.js）`#/settings`
- 每日新词数（数字输入，默认 10）。
- 复习数量（默认 20）。
- 发音：语音偏好（自动优先美音 / 强制美音 / 强制英音）、语音下拉（显示当前语音）、
  🔊 试听按钮、刷新语音列表；语速滑块（0.5–1.5，默认 0.9）、音调滑块（0.5–1.5，默认 1.0）、
  卡片自动发音开关。切换语音即时生效（重新初始化 TTS）。
- 反馈：音效开关、震动开关。
- 语法解锁阈值（默认 500）。
- 数据：导出备份（下载 JSON）、导入备份（文件选择，整体替换）、清空全部进度（二次确认）。

### 9.8 无限模式（infinite.js）`#/infinite`

- 首页「⚡ 无限模式」卡片进入；**全词库随机出题**（每批洗牌 3500 词，避免相邻重复）。
- 玩法：看中文（含词性标签）→ 下划线打字默写英文；答对 +10 分 × 连击倍率
  （连击 ≥5 时 ×2、≥10 时 ×3，界面显示 🔥 倍率与连击数）。
- 「显示答案」跳过不计分、连击清零；打字敲错仅抖动提示（不扣分）。
- 无限答题，随时点「结束」或按 Esc 结算：得分/答对数/正确率/最高连击/用时；
  **最高分自动保存**（kv `infiniteBest`，首页卡片显示"最高 X 分"），超过历史记录才更新。
- 快捷键：Space 发音、Esc 结束（结算页 Enter 再来一局、Esc 回首页）。
- 结算页「再来一局」重新开局，游戏状态（得分/连击/题数）全部重置。

### 9.9 键盘快捷键（桌面端，`keydown` 监听，视图销毁时移除）

| 视图 | 按键 | 动作 |
|---|---|---|
| 首页 | Enter | 开始/继续学习 |
| 学习·看词阶段 | Enter / Space / Esc | 开始默写 / 发音 / 返回首页 |
| 学习·打字阶段 | Space / Esc | 发音 / 显示答案 |
| 学习·完成页 | Enter / R | 回到首页 / 去复习 |
| 复习·模式选择 | 1 / 2 | 英译中 / 中译英 |
| 复习·英译中 | 1-4 / Space / Esc | 选对应选项 / 发音 / 返回 |
| 复习·中译英 | Esc | 显示答案 |
| 复习·结束页 | Enter / Esc | 再复习一轮 / 换模式 |
| 无限·游戏中 | Space / Esc | 发音 / 结束结算 |
| 无限·结算页 | Enter / Esc | 再来一局 / 回首页 |

- 打字输入框聚焦时，Space/Enter 不触发快捷动作（避免干扰输入）。
- 快捷键以 **kbd 徽章直接印在对应按钮上**（如「开始默写 ⏎」「显示答案 Esc」「选项 1-4」），
  同时保留页面底部的快捷键提示条。
- 视图卸载（路由切换）时必须移除 keydown 监听并清理 setTimeout（destroy 钩子）。
- 键盘动作不依赖音效/震动（反馈异常不吞掉动作）；动作函数带幂等保护（如 `phase` 守卫），
  防「按钮聚焦 + Enter」双触发。
- **作用域铁律**：键盘处理器引用的动作函数（如 `toTypePhase`）必须定义在视图根作用域
  （renderLearn 级），禁止定义在子函数（如 showWord）内——否则运行时 ReferenceError 会被
  try/catch 吞掉，表现为"按了没反应"。

## 10. 发音（`app/src/tts.js`）

- 封装 `speechSynthesis`：`speak(text)`、`getVoices()`、`getCurrentVoiceName()`。
- **健壮性（会话 17 修复线上无声）**：
  - 只保存 `voiceURI`（字符串），**每次 speak 前重新 `getVoices()` 解析 fresh 引用**
    ——修复 Chrome 已知 bug：陈旧 voice 对象引用导致 `speak()` 静默失败（无声无错）。
  - 静默失败兜底：`speak` 后 200ms 检测未开始播放则自动重试一次（Chrome cancel+speak 丢句 bug）。
  - 浏览器不支持 TTS 时 toast 提示，不再静默。
- **默认语音选择**（`pick`）：用户手动指定的 `voiceURI` 优先；否则按
  `voicePreference`（`auto` 美音优先→英音→其它 en；或强制 `en-US`/`en-GB`）过滤，
  再按**自然发音优先名单**排序（Google/Microsoft 自然音、Samantha、Victoria、Daniel、Karen 等，
  名称包含匹配，见代码 `VOICE_PRIORITY`），最后取首个 en 语音。
- 设置页提供：语音偏好选择、语音下拉（含当前语音标识）、🔊 试听（读 "Hello! How are you today?"）、
  刷新列表按钮；**切换后立即生效**（重新调用 `initTTS`），无需刷新页面。
- 播放前 `cancel()` 上一次，防止快速连点叠加。
- 预留：words.json 条目若有 `audio` 字段（二期真人发音 URL），优先播放该音频。

## 11. 统计与连续天数

- 每天首次成功默写一个词时：若 `stats.lastActiveDate === 昨天` → streak+1；
  若等于今天 → 不变；否则重置为 1。`bestStreak` 取历史最大值。
- `session` 每天重置：`date` 变化时 `learnedToday` 清空（在启动与跨天检测时处理）。
- 近 7 日数据：`kv.last7`（数组，每天 `{date, newWords}`），每日结束时/跨天时滚动更新。

## 12. PWA 与离线

- `manifest.webmanifest`：name "DailyWords 每日单词"、short_name "DailyWords"、display "standalone"、
  theme_color `#4f46e5`、background_color `#f8fafc`、icons（192/512 PNG + SVG，`any maskable`）。
- `app/sw.js`（缓存名 `dw-v2`）：
  - **代码文件**（HTML/JS/CSS/manifest）：**网络优先**，失败回退缓存——开发迭代刷新即生效。
  - **数据/图标**（`data/words.json`、`icons/`）：**缓存优先**——省流量、离线可用。
  - 安装时预缓存全部静态资源；缓存名带版本号（`dw-vN`），升级时 `activate` 删除旧缓存。
- `main.js` 注册 SW（仅 https/localhost 生效）；离线时 app 完整可用（词库已缓存）。

## 13. 词库数据管道（`scripts/build-wordlist.mjs`）

三个数据源（均通过 jsDelivr CDN 获取，下载缓存于 `.cache/`，重跑自动复用；若上游失效，在
`mahavivo/english-wordlists`、`mahavivo/open-ecdict` 仓库找最新路径并更新脚本内 URL）：

| 文件 | 作用 |
|---|---|
| `COCA_20000.txt`（mahavivo/english-wordlists） | 词频顺序权威（COCA 语料库 2 万高频词） |
| `CET4_edited.txt`（mahavivo/english-wordlists） | 主释义源：四级词表，学习者向的干净中文释义 + 音标 |
| `open_ecdict.txt`（mahavivo/open-ecdict） | 兜底释义/音标：开源英汉词典，覆盖 CET4 之外的词 |
| `wordnet.zip`（NLTK 打包的 WordNet 3.0，jsDelivr） | 示例短句：`scripts/extract_examples.py` 从词义 gloss 提取例句（完整句优先、片段兜底，需含目标词独立出现） |

合并规则：
1. 解析三个文件（CET4：`word [音标] pos.释义`，首现优先、跳过缩写行；
   open_ecdict：`word ⇒ [音标] ※ 释义 〇〈N〉`，只取纯字母词、第一义群）。
2. 按 COCA 词频序遍历去重后的词，取前 3500 个有释义的词。
3. 释义优先 CET4，其次 open_ecdict；音标同理（CET4 优先）。
4. 写出 `app/data/words.json`（含 meta）；若存在 WordNet 数据缓存，调用
   `scripts/extract_examples.py`（python3）为每个词合并 `example` 短句，并打印统计
   （释义来源占比、音标缺失数、例句覆盖数）供人工检查。

- 复现：删除 `app/data/words.json` 与 `.cache/` 后重跑即可重新生成。
- 输出文件需 `git` 入库（保证离线可构建）。
- 质量说明：COCA top 3500 中约 84% 使用 CET4 释义（常见词释义干净适合学习），约 16% 由
  open_ecdict 兜底（中低频词，释义为词典风格）。已知音标缺失约 5 词（前端自动隐藏音标行）。

## 14. 路线图

**Phase 1（当前，本仓库交付）**：§4–§12 全部——数据管道、每日学习流（发音/音标/打字打击感）、
复习双向、语法占位、设置、备份、统计、PWA、Docker 部署、静态部署、node --test 测试。

**Phase 2（二期）**：
- 复习升级：句子复习模式（中译英句子 → 英译中句子），需补充例句数据源（可复用 ECDICT 的
  `definition`/`detail` 或引入开源例句库，如 Tatoeba）。
- 错词本专项复习页（只刷错词）。
- 轻量间隔重复（SRS）：progress 记录加 `nextDueAt`，复习采样优先到期词。
- 语法内容：从简单句到文章的课程体系（内置静态内容，纯 HTML 页面）。
- 真人发音：words.json 加 `audio` 字段接入。

**Phase 3（远期）**：多设备云同步（可选轻后端）、AI 生成例句、听力模式（只听不看默写）。

## 15. 测试（`tests/`，node --test，零依赖）

必须覆盖的纯逻辑（UI 不测）：
- `queues.test.js`：取词（顺延、配额、打乱、学完取尽）、复习采样（错词优先比例、去重、数量不足）。
- `typing.test.js`：逐字母判定（大小写、空格/标点、完成判定、错误不前进）。
- `db.test.js`：IndexedDB 在 Node 不可用——改为对备份序列化/反序列化的纯函数测试
  （`db.js` 中把备份组装拆成纯函数导出）。
- `tts 等浏览器 API 不测`。

运行：`node --test tests/`。
