/* ============================================================
   queues.js — 取词与复习采样（纯逻辑，无 DOM，可 node --test 测试）
   规格见 docs/SPEC.md §6.1 与 §7。
   ============================================================ */

/** Fisher-Yates 洗牌（不修改原数组） */
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 取今天的学习批次：从未学池（按词频升序 = 文件顺序）取前 quota 个，再随机打乱。
 * 未学的词没有记录 → 下次仍排在未学池前面 = 自然顺延（SPEC §6.1）。
 * @param {number} quota 每日新词数
 * @param {Array<{word:string}>} words 全词库（文件顺序 = frq 升序）
 * @param {Set<string>} learnedIds 已学词集合
 * @param {Function} [rng]
 * @returns {Array<{word:string}>} 本日批次（已打乱）
 */
export function getNextBatch(quota, words, learnedIds, rng = Math.random) {
  const unseen = words.filter((w) => !learnedIds.has(w.word));
  return shuffle(unseen.slice(0, quota), rng);
}

/**
 * 复习采样：最多 30% 来自错词本（wrongCount>0 且已学），其余随机，整体去重打乱。
 * @param {number} count 本轮复习数量
 * @param {Array<{word:string}>} learnedWords 已学词对象数组
 * @param {Array<string>} wrongWordIds 错词本词 id 数组
 * @param {Function} [rng]
 * @returns {Array<{word:string}>}
 */
export function sampleReview(count, learnedWords, wrongWordIds, rng = Math.random) {
  if (count <= 0 || learnedWords.length === 0) return [];
  const wrongSet = new Set(wrongWordIds);
  const wrong = shuffle(learnedWords.filter((w) => wrongSet.has(w.word)), rng);
  const takeWrong = Math.min(Math.ceil(count * 0.3), wrong.length);
  const wrongTaken = new Set(wrong.slice(0, takeWrong).map((w) => w.word));
  const rest = shuffle(learnedWords.filter((w) => !wrongTaken.has(w.word)), rng);
  return shuffle(
    [...wrong.slice(0, takeWrong), ...rest.slice(0, count - takeWrong)],
    rng
  );
}
