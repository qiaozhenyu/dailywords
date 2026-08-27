/* ============================================================
   tests/queues.test.js — 取词/复习采样纯逻辑测试（SPEC §6.1 §7）
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getNextBatch, sampleReview, shuffle } from "../app/src/queues.js";

const words = Array.from({ length: 20 }, (_, i) => ({ word: "w" + i }));

test("getNextBatch 取前 quota 个未学词并打乱", () => {
  const learned = new Set(["w0", "w1", "w2"]);
  const rng = () => 0.5; // 确定性洗牌
  const batch = getNextBatch(5, words, learned, rng);
  assert.equal(batch.length, 5);
  const ids = batch.map((w) => w.word).sort();
  assert.deepEqual(ids, ["w3", "w4", "w5", "w6", "w7"]);
  // 都不在已学集合
  for (const w of batch) assert.equal(learned.has(w.word), false);
});

test("getNextBatch 未学词顺延：未学的仍排最前", () => {
  // 学 w0，未学 w1..w19：下一次仍从 w1 开始（顺序可能被打乱，检查集合）
  const learned = new Set(["w0"]);
  const batch = getNextBatch(3, words, learned, () => 0);
  assert.deepEqual(batch.map((w) => w.word).sort(), ["w1", "w2", "w3"]);
});

test("getNextBatch 剩余不足 quota 时取尽", () => {
  const learned = new Set(words.slice(0, 18).map((w) => w.word));
  const batch = getNextBatch(10, words, learned);
  assert.equal(batch.length, 2);
});

test("shuffle 不修改原数组", () => {
  const a = [1, 2, 3, 4];
  const b = shuffle(a, () => 0.5);
  assert.notEqual(a, b);
  assert.deepEqual([...a].sort(), [...b].sort());
});

test("sampleReview 错词优先（保底 30%）且去重", () => {
  // 10 个已学词中有 6 个错词：保底取 ceil(10*0.3)=3 个，其余随机池还可能抽到错词
  const learned = words.slice(0, 10);
  const wrongIds = ["w0", "w1", "w2", "w3", "w4", "w5"];
  const out = sampleReview(10, learned, wrongIds, () => 0.3);
  assert.equal(out.length, 10);
  const seen = new Set(out.map((w) => w.word));
  assert.equal(seen.size, 10, "不应有重复词");
  const wrongTaken = out.filter((w) => wrongIds.includes(w.word)).length;
  assert.ok(wrongTaken >= 3, `错词保底 3 个，实际 ${wrongTaken}`);
  assert.ok(wrongTaken <= 6, `错词最多 6 个，实际 ${wrongTaken}`);
});

test("sampleReview 错词恰好 30%：错词数恰为配额", () => {
  // 20 个已学词，3 个错词，count=10：保底 3 个错词，随机池已无错词 → 恰好 3 个
  const learned = words.slice(0, 20);
  const wrongIds = ["w0", "w1", "w2"];
  const out = sampleReview(10, learned, wrongIds, () => 0.5);
  const wrongTaken = out.filter((w) => wrongIds.includes(w.word)).length;
  assert.equal(wrongTaken, 3);
});

test("sampleReview 数量不足时返回全部已学", () => {
  const learned = words.slice(0, 3);
  const out = sampleReview(20, learned, [], () => 0.5);
  assert.equal(out.length, 3);
});

test("sampleReview 空输入返回空数组", () => {
  assert.deepEqual(sampleReview(5, [], []), []);
  assert.deepEqual(sampleReview(0, words, []), []);
});
