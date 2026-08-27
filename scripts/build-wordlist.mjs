/* ============================================================
   build-wordlist.mjs — 生成 app/data/words.json（规格见 docs/SPEC.md §4.1 §13）
   数据源（均通过 jsDelivr CDN 获取，下载缓存于 .cache/）：
     1. COCA_20000.txt       词频顺序权威（COCA 语料库 20000 高频词）
     2. CET4_edited.txt      四级词表（学习者向：干净的中文释义 + 音标，主释义源）
     3. open_ecdict.txt      开源英汉词典（兜底释义/音标，覆盖 CET4 之外的词）
   合并规则：按 COCA 词频序取前 3500 个有释义的词；释义优先 CET4，其次 open_ecdict。
   用法：node scripts/build-wordlist.mjs
   ============================================================ */
import { mkdirSync, existsSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, ".cache");
const OUT_PATH = join(ROOT, "app", "data", "words.json");
const TARGET_COUNT = 3500;

const SOURCES = [
  {
    name: "COCA_20000.txt",
    url: "https://cdn.jsdelivr.net/gh/mahavivo/english-wordlists@master/COCA_20000.txt",
    minBytes: 100_000
  },
  {
    name: "CET4_edited.txt",
    url: "https://cdn.jsdelivr.net/gh/mahavivo/english-wordlists@master/CET4_edited.txt",
    minBytes: 100_000
  },
  {
    name: "open_ecdict.txt",
    url: "https://cdn.jsdelivr.net/gh/mahavivo/open-ecdict@master/open_ecdict.txt",
    minBytes: 5_000_000
  }
];

function step(msg) {
  console.log(`[build-wordlist] ${msg}`);
}

function fetchSource(src) {
  const dest = join(CACHE_DIR, src.name);
  if (existsSync(dest) && statSync(dest).size > src.minBytes) {
    step(`使用缓存 ${src.name}`);
    return readFileSync(dest, "utf-8");
  }
  step(`下载 ${src.name} (${src.url})`);
  mkdirSync(CACHE_DIR, { recursive: true });
  execFileSync("curl", ["-s", "-o", dest, "-m", "240", src.url], { stdio: "inherit" });
  const size = statSync(dest).size;
  if (size < src.minBytes) throw new Error(`${src.name} 下载不完整 (${size}B)`);
  return readFileSync(dest, "utf-8");
}

/** 解析 CET4 词表：word [音标] pos.释义（首现优先，跳过缩写行） */
function parseCET4(text) {
  const map = new Map();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[A-Z]$/.test(line)) continue; // 字母分组标题
    const m = line.match(/^([a-zA-Z]+)\s*(?:\[([^\]]*)\])?\s*(.*)$/);
    if (!m) continue;
    const [, word, phon, rest] = m;
    if (!rest || rest.startsWith(".") || rest.startsWith("(缩")) continue; // 缩写干扰项
    const key = word.toLowerCase();
    if (map.has(key)) continue; // 首现优先
    const translation = rest
      .replace(/^([a-z]+\.)\s*/i, "$1 ") // pos 后补空格: "n.苹果" -> "n. 苹果"
      .replace(/\s+/g, " ")
      .trim();
    map.set(key, { phonetic: (phon || "").trim(), translation });
  }
  return map;
}

/** 解析 open_ecdict：word ⇒ [音标] ※ 释义 〇〈N〉（只作兜底） */
function parseOpenEcdict(text) {
  const map = new Map();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\S+)\s+⇒\s+(.*?)\s+※\s+(.*)$/);
    if (!m) continue;
    const [, word, phonRaw, meaningRaw] = m;
    const key = word.toLowerCase();
    if (!/^[a-z]+$/.test(key)) continue; // 只要纯字母词
    if (map.has(key)) continue;
    // 音标：优先 [ ... ]，其次 / ... /
    let phon = "";
    const bm = phonRaw.match(/\[([^\]]*)\]/);
    const sm = phonRaw.match(/\/([^/]*)\//);
    if (bm) phon = bm[1].trim();
    else if (sm) phon = sm[1].trim();
    // 释义：去 〇〈N〉 标记，只取第一义群（" | " 分隔）
    let meaning = meaningRaw.replace(/〇〈.*?〉/g, "").trim();
    meaning = meaning.split(" | ")[0].trim();
    // 去掉空序号残留："1. 2. 3.xxx" -> 清理连续空序号
    meaning = meaning.replace(/(?:\d+\.\s*)+/g, (s) => (s.match(/\d+\./g) || []).length > 1 ? "" : s);
    if (!meaning) continue;
    map.set(key, { phonetic: phon, translation: meaning });
  }
  return map;
}

/** 解析 COCA_20000：按行取词频序（去重） */
function parseCOCA(text) {
  const seen = new Set();
  const order = [];
  for (const l of text.split("\n")) {
    const w = l.trim().toLowerCase();
    if (!w || seen.has(w)) continue;
    if (!/^[a-z]+$/.test(w)) continue;
    seen.add(w);
    order.push(w);
  }
  return order;
}

function build() {
  const [cocaText, cet4Text, ecdictText] = SOURCES.map(fetchSource);

  const order = parseCOCA(cocaText);
  const cet4 = parseCET4(cet4Text);
  const ecdict = parseOpenEcdict(ecdictText);
  step(`COCA 词序: ${order.length} · CET4 词条: ${cet4.size} · open_ecdict 词条: ${ecdict.size}`);

  const words = [];
  const usedFrom = { cet4: 0, ecdict: 0 };
  for (const w of order) {
    if (words.length >= TARGET_COUNT) break;
    let entry = cet4.get(w);
    let src = "cet4";
    if (!entry) {
      entry = ecdict.get(w);
      src = "ecdict";
    }
    if (!entry) continue;
    usedFrom[src] += 1;
    words.push({
      word: w,
      phonetic: (entry.phonetic || "").replace(/^['`ʼ]+/, ""), // 去掉音标前导撇号
      translation: entry.translation,
      frq: words.length + 1 // 词频位次 = COCA 序位
    });
  }

  // 示例短句：如存在 WordNet 数据则提取合并（规格 §4.1 example 字段）
  let exampleCount = 0;
  const wnDir = join(CACHE_DIR, "wordnet-nltk", "wordnet");
  if (existsSync(join(wnDir, "data.noun"))) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(OUT_PATH_TMP(), JSON.stringify({ words }), "utf-8");
    const examplesJson = execFileSync("python3", [
      join(ROOT, "scripts", "extract_examples.py"),
      OUT_PATH_TMP(),
      wnDir
    ], { encoding: "utf-8" }).trim();
    const examples = JSON.parse(examplesJson);
    for (const w of words) {
      const ex = examples[w.word];
      if (ex) {
        w.example = ex;
        exampleCount++;
      }
    }
    step(`示例短句合并: ${exampleCount} 个词有例句`);
  } else {
    step("跳过例句（未找到 WordNet 数据 .cache/wordnet-nltk/wordnet）");
  }

  const out = {
    meta: {
      source: "COCA 20000 (词频序) + CET4 (主释义) + open_ecdict (兜底)",
      order: "COCA frequency ascending",
      count: words.length,
      examples: exampleCount,
      generatedAt: new Date().toISOString()
    },
    words
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 1) + "\n");

  const noPhonetic = words.filter((w) => !w.phonetic).length;
  step(`输出 ${OUT_PATH}`);
  step(`单词数: ${words.length} · 音标缺失: ${noPhonetic} · 例句覆盖: ${exampleCount}`);
  step(`释义来源: CET4 ${usedFrom.cet4} 个 / open_ecdict 兜底 ${usedFrom.ecdict} 个`);
  step("完成 ✅");
}

/** 提取例句时临时写出的 words 文件路径（供 python 脚本读取，避免依赖未生成的正式文件） */
function OUT_PATH_TMP() {
  return join(CACHE_DIR, "words-for-examples.json");
}

try {
  build();
} catch (e) {
  console.error("[build-wordlist] 失败:", e.message);
  process.exit(1);
}
