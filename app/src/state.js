/* ============================================================
   state.js — 全局状态（内存缓存 + IndexedDB 持久化 + 派生数据）
   规格：SPEC §4.2 §5 §11。词库在启动时 fetch data/words.json 载入内存。
   ============================================================ */
import * as db from "./db.js";

export const DEFAULT_SETTINGS = {
  dailyQuota: 10,
  reviewCount: 20,
  voiceURI: "",
  voicePreference: "auto", // auto | en-US | en-GB
  rate: 0.9,
  pitch: 1.0,
  sfxOn: true,
  hapticsOn: true,
  autoSpeak: true,
  grammarUnlockAt: 500
};

export const state = {
  words: [],
  progressMap: new Map(), // wordId -> progress 记录
  settings: { ...DEFAULT_SETTINGS },
  stats: { totalLearned: 0, totalReview: 0, wrongTotal: 0, bestStreak: 0, streak: 0, lastActiveDate: "" },
  session: { date: "", learnedToday: [] },
  last7: [], // [{date, newWords}]
  infiniteBest: { score: 0, combo: 0, correct: 0, date: "" }, // 无限模式最高分
  loaded: false
};

/** 本地时区 YYYY-MM-DD */
export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function loadWords() {
  try {
    const res = await fetch("data/words.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("words.json 加载失败: " + res.status);
    const data = await res.json();
    return data.words || [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function initState() {
  state.words = await loadWords();
  state.progressMap = new Map();
  for (const rec of await db.getAllProgress()) state.progressMap.set(rec.wordId, rec);

  const settings = await db.getKv("settings");
  if (settings) state.settings = { ...DEFAULT_SETTINGS, ...settings };
  const stats = await db.getKv("stats");
  if (stats) state.stats = { ...state.stats, ...stats };
  const session = await db.getKv("session");
  if (session) state.session = { ...state.session, ...session };
  const last7 = await db.getKv("last7");
  if (last7) state.last7 = last7;
  const infiniteBest = await db.getKv("infiniteBest");
  if (infiniteBest) state.infiniteBest = { ...state.infiniteBest, ...infiniteBest };

  // 跨天检测：session.date 过期则重置今日会话
  const today = todayStr();
  if (state.session.date !== today) {
    state.session = { date: today, learnedToday: [] };
    await db.setKv("session", state.session);
  }
  state.loaded = true;
}

export function isLearned(word) {
  const rec = state.progressMap.get(word);
  return !!rec && rec.status === "learned";
}

export function learnedCount() {
  let n = 0;
  for (const rec of state.progressMap.values()) if (rec.status === "learned") n++;
  return n;
}

export function learnedWords() {
  return state.words.filter((w) => isLearned(w.word));
}

export function wrongWordIds() {
  const out = [];
  for (const rec of state.progressMap.values()) if (rec.wrongCount > 0) out.push(rec.wordId);
  return out;
}

export function unseenCount() {
  return state.words.length - learnedCount();
}

/** 今日已学数（当天 learn 成功默写的词数） */
export function todayLearnedCount() {
  return state.session.date === todayStr() ? state.session.learnedToday.length : 0;
}

async function persistProgress(rec) {
  state.progressMap.set(rec.wordId, rec);
  await db.setProgress(rec);
}

/** 学习成功：标记掌握（规格 §6.2） */
export async function markLearned(wordId) {
  const now = Date.now();
  const old = state.progressMap.get(wordId);
  const rec = old || {
    wordId,
    status: "learned",
    learnedAt: now,
    correctCount: 0,
    wrongCount: 0,
    lastSeenAt: now,
    reviewCount: 0
  };
  rec.status = "learned";
  rec.learnedAt = rec.learnedAt || now;
  rec.correctCount += 1;
  rec.lastSeenAt = now;
  await persistProgress(rec);

  // 统计与连续天数（规格 §11）
  const today = todayStr();
  if (state.stats.lastActiveDate !== today) {
    if (state.stats.lastActiveDate === yesterdayStr()) {
      state.stats.streak = (state.stats.streak || 0) + 1;
    } else {
      state.stats.streak = 1;
    }
    state.stats.bestStreak = Math.max(state.stats.bestStreak || 0, state.stats.streak);
  }
  if (state.session.date === today && !state.session.learnedToday.includes(wordId)) {
    state.session.learnedToday.push(wordId);
    await db.setKv("session", state.session);
  }
  state.stats.lastActiveDate = today;
  await db.setKv("stats", state.stats);
  await bumpLast7(today);
}

/** 复习记录（规格 §7） */
export async function recordReview(wordId, ok) {
  const now = Date.now();
  const old = state.progressMap.get(wordId);
  const rec = old || {
    wordId,
    status: isLearned(wordId) ? "learned" : "new",
    learnedAt: 0,
    correctCount: 0,
    wrongCount: 0,
    lastSeenAt: now,
    reviewCount: 0
  };
  if (ok) rec.correctCount += 1;
  else rec.wrongCount += 1;
  rec.reviewCount += 1;
  rec.lastSeenAt = now;
  await persistProgress(rec);
  state.stats.totalReview += 1;
  await db.setKv("stats", state.stats);
}

/** 学习/复习中看到但没答（显示答案/跳过）——只更新 lastSeenAt，不进正确错误 */
export async function markSeen(wordId) {
  const old = state.progressMap.get(wordId);
  if (!old) return;
  old.lastSeenAt = Date.now();
  await persistProgress(old);
}

async function bumpLast7(today) {
  const arr = state.last7.filter((x) => x.date !== today);
  const cur = (state.last7.find((x) => x.date === today) || { date: today, newWords: 0 });
  cur.newWords += 1;
  state.last7 = [...arr, cur].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-7);
  await db.setKv("last7", state.last7);
}

/** 更新设置并持久化 */
export async function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.setKv("settings", state.settings);
}

/** 清空全部进度（二次确认后调用） */
export async function resetAll() {
  await db.clearAll();
  state.progressMap = new Map();
  state.stats = { totalLearned: 0, totalReview: 0, wrongTotal: 0, bestStreak: 0, streak: 0, lastActiveDate: "" };
  state.session = { date: todayStr(), learnedToday: [] };
  state.last7 = [];
  await db.setKv("session", state.session);
  await db.setKv("stats", state.stats);
  await db.setKv("last7", state.last7);
}

/** 导出备份并触发下载 */
export async function exportBackupFile() {
  const backup = await db.exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dailywords-backup-${todayStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return backup;
}

/** 记录无限模式成绩（超过历史最高则保存） */
export async function saveInfiniteBest(result) {
  const cur = state.infiniteBest;
  if (result.score > cur.score) {
    state.infiniteBest = {
      score: result.score,
      combo: result.bestCombo,
      correct: result.correct,
      date: todayStr()
    };
    await db.setKv("infiniteBest", state.infiniteBest);
  }
  return state.infiniteBest;
}

/** 从 File 导入备份 */
export async function importBackupFile(file) {
  const text = await file.text();
  const ok = await db.importBackup(text);
  if (!ok) return false;
  // 重新加载内存状态
  await initState();
  return true;
}
