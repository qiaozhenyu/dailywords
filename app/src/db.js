/* ============================================================
   db.js — IndexedDB 封装（progress / kv 两个 store，规格见 SPEC §4.2 §5）
   浏览器 API 只在函数内使用，纯函数（buildBackup/parseBackup）可 node --test。
   ============================================================ */
const DB_NAME = "dailywords";
const DB_VERSION = 1;
const SCHEMA_VERSION = 1;

let dbPromise = null;

export function init() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "wordId" });
      }
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function openStore(name, mode) {
  return init().then((db) => {
    if (!db) return null;
    return db.transaction(name, mode).objectStore(name);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function getProgress(wordId) {
  return openStore("progress", "readonly").then((s) => (s ? reqToPromise(s.get(wordId)) : null));
}

export function setProgress(rec) {
  return openStore("progress", "readwrite").then((s) =>
    s ? reqToPromise(s.put(rec)) : null
  );
}

export function getAllProgress() {
  return openStore("progress", "readonly").then((s) => (s ? reqToPromise(s.getAll()) : []));
}

export function getKv(key) {
  return openStore("kv", "readonly").then(async (s) => {
    if (!s) return null;
    const rec = await reqToPromise(s.get(key));
    return rec ? rec.value : null;
  });
}

export function setKv(key, value) {
  return openStore("kv", "readwrite").then((s) =>
    s ? reqToPromise(s.put({ key, value })) : null
  );
}

/* ---------- 备份（纯函数部分可测） ---------- */

/** 组装备份对象（纯函数） */
export function buildBackup(progress, kv) {
  return {
    app: "dailywords",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    progress,
    kv
  };
}

/** 校验并解析备份（纯函数，非法输入返回 null） */
export function parseBackup(json) {
  if (typeof json === "string") {
    try {
      json = JSON.parse(json);
    } catch (_) {
      return null;
    }
  }
  if (!json || typeof json !== "object") return null;
  if (json.app !== "dailywords") return null;
  // 畸形数据直接拒绝，防止导入空数据清空进度
  if (json.progress !== undefined && !Array.isArray(json.progress)) return null;
  if (json.kv !== undefined && (typeof json.kv !== "object" || json.kv === null)) return null;
  const progress = Array.isArray(json.progress) ? json.progress : [];
  const kv = json.kv && typeof json.kv === "object" ? json.kv : {};
  return { schemaVersion: json.schemaVersion || 1, exportedAt: json.exportedAt, progress, kv };
}

/** 导出完整备份 */
export async function exportBackup() {
  const [progress, kvRecords] = await Promise.all([
    getAllProgress(),
    openStore("kv", "readonly").then((s) => (s ? reqToPromise(s.getAll()) : []))
  ]);
  const kv = {};
  for (const r of kvRecords || []) kv[r.key] = r.value;
  return buildBackup(progress, kv);
}

/** 导入备份（整体替换，失败返回 false） */
export async function importBackup(backup) {
  const parsed = parseBackup(backup);
  if (!parsed) return false;
  const db = await init();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(["progress", "kv"], "readwrite");
    const pStore = tx.objectStore("progress");
    const kStore = tx.objectStore("kv");
    pStore.clear();
    kStore.clear();
    for (const rec of parsed.progress) pStore.put(rec);
    for (const key of Object.keys(parsed.kv)) kStore.put({ key, value: parsed.kv[key] });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

/** 清空全部进度 */
export async function clearAll() {
  const db = await init();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(["progress", "kv"], "readwrite");
    tx.objectStore("progress").clear();
    tx.objectStore("kv").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
