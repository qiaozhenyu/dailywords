/* ============================================================
   tests/db-backup.test.js — 备份组装/解析纯函数测试（SPEC §5）
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackup, parseBackup } from "../app/src/db.js";

test("buildBackup 结构正确", () => {
  const b = buildBackup([{ wordId: "apple", status: "learned" }], { settings: { dailyQuota: 10 } });
  assert.equal(b.app, "dailywords");
  assert.equal(b.schemaVersion, 1);
  assert.equal(b.progress.length, 1);
  assert.equal(b.kv.settings.dailyQuota, 10);
  assert.ok(b.exportedAt);
});

test("parseBackup 接受对象与字符串", () => {
  const obj = { app: "dailywords", progress: [], kv: {} };
  assert.ok(parseBackup(obj));
  assert.ok(parseBackup(JSON.stringify(obj)));
});

test("parseBackup 拒绝非法输入", () => {
  assert.equal(parseBackup(null), null);
  assert.equal(parseBackup("not json"), null);
  assert.equal(parseBackup({ app: "other" }), null);
  assert.equal(parseBackup({ app: "dailywords", progress: "oops", kv: 3 }), null);
});

test("parseBackup 往返一致", () => {
  const b = buildBackup([{ wordId: "the", status: "learned" }], { stats: { streak: 2 } });
  const p = parseBackup(JSON.stringify(b));
  assert.deepEqual(p.progress, b.progress);
  assert.deepEqual(p.kv, b.kv);
});
