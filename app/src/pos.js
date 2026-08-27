/* ============================================================
   pos.js — 词性解析（从翻译前缀提取，如 "n. 苹果" → 名词）
   供学习/复习卡片显示词性标签（图标 + 中文词性，规格 §9.2 布局）
   ============================================================ */
const POS_MAP = {
  n: ["n.", "名词", "📗"],
  v: ["v.", "动词", "📘"],
  vt: ["vt.", "动词", "📘"],
  vi: ["vi.", "动词", "📘"],
  aux: ["aux.", "助动词", "⚡"],
  adj: ["adj.", "形容词", "📙"],
  a: ["adj.", "形容词", "📙"],
  adv: ["adv.", "副词", "📕"],
  ad: ["adv.", "副词", "📕"],
  prep: ["prep.", "介词", "📔"],
  conj: ["conj.", "连词", "📓"],
  pron: ["pron.", "代词", "📒"],
  num: ["num.", "数词", "📖"],
  art: ["art.", "冠词", "📎"],
  int: ["int.", "感叹词", "💬"],
  interj: ["interj.", "感叹词", "💬"]
};

/**
 * 从翻译文本解析词性
 * @param {string} translation 如 "n. 苹果；苹果树" / "vt. 丢弃；放弃"
 * @returns {{code:string, label:string, icon:string}|null}
 */
export function parsePos(translation) {
  if (typeof translation !== "string") return null;
  const m = translation.match(/^([a-z]+)\./);
  if (!m) return null;
  const entry = POS_MAP[m[1].toLowerCase()];
  if (!entry) return null;
  return { code: entry[0], label: entry[1], icon: entry[2] };
}

/** 去掉词性前缀后的纯词义文本，如 "n. 苹果" → "苹果" */
export function stripPos(translation) {
  if (typeof translation !== "string") return "";
  return translation.replace(/^[a-z]+\.\s*/, "");
}

/**
 * 取「第一个义项」（学习卡片用，避免一次显示多个意思）
 * 规则：去词性前缀 → 取第一个词性组（" | " 分隔）→ 取第一个编号义项（"1.xxx 2.yyy"）→
 * 取第一个分号段（"；" 分隔）；结果为空则回退整段。
 * @param {string} translation 如 "vt. 丢弃；放弃" / "n. 1.跑 2.跑步" → "丢弃" / "跑"
 */
export function firstMeaning(translation) {
  let t = stripPos(translation).split(" | ")[0].trim();
  // 编号义项：取第一个（"1.xxx 2.yyy"，点号后可能无空格）
  const nm = t.match(/^\s*\d+\.\s*(.*?)(?=\s+\d+\.|$)/);
  if (nm && nm[1].trim()) {
    t = nm[1].trim();
  }
  // 分号取第一个
  t = t.split("；")[0].trim();
  return t || stripPos(translation).split("；")[0].trim();
}
