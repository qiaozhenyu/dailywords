/* ============================================================
   tests/typing.test.js — 打字引擎纯逻辑测试（SPEC §8）
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { initTyping, pressKey, typingProgress, isTypingDone } from "../app/src/typing.js";

test("正确逐个字母输入", () => {
  let s = initTyping("Apple");
  const seq = "apple";
  for (const ch of seq) {
    const r = pressKey(s, ch);
    assert.equal(r.ok, true, `字母 ${ch} 应被接受`);
    s = r.state;
  }
  assert.equal(isTypingDone(s), true);
  assert.equal(typingProgress(s), 1);
});

test("大小写不敏感", () => {
  let s = initTyping("hello");
  let r = pressKey(s, "H");
  assert.equal(r.ok, true);
  s = r.state;
  assert.equal(s.pos, 1);
});

test("敲错不前进，errors+1", () => {
  const s = initTyping("cat");
  const r = pressKey(s, "x");
  assert.equal(r.ok, false);
  assert.equal(r.error, "mismatch");
  assert.equal(r.state.pos, 0);
  assert.equal(r.state.errors, 1);
});

test("非字母字符被忽略", () => {
  let s = initTyping("dog");
  let r = pressKey(s, " ");
  assert.equal(r.ok, false);
  assert.equal(r.error, "invalid");
  s = r.state;
  r = pressKey(s, "1");
  assert.equal(r.error, "invalid");
  assert.equal(s.pos, 0);
});

test("完成后再按键返回 done", () => {
  let s = initTyping("a");
  s = pressKey(s, "a").state;
  assert.equal(isTypingDone(s), true);
  const r = pressKey(s, "b");
  assert.equal(r.ok, false);
  assert.equal(r.error, "done");
});

test("progress 随进度变化", () => {
  let s = initTyping("abc");
  s = pressKey(s, "a").state;
  assert.equal(typingProgress(s), 1 / 3);
  s = pressKey(s, "b").state;
  assert.equal(typingProgress(s), 2 / 3);
});
