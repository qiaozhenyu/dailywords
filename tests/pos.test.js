/* ============================================================
   tests/pos.test.js — 词性解析（规格 §9.2 词性标签）
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePos, stripPos, firstMeaning } from "../app/src/pos.js";

test("parsePos 返回对象结构（code/label/icon）", () => {
  const pos = parsePos("n. 苹果；苹果树");
  assert.ok(pos, "应解析出词性");
  assert.equal(pos.code, "n.");
  assert.equal(pos.label, "名词");
  assert.equal(pos.icon, "📗");
});

test("parsePos 常见词性", () => {
  assert.equal(parsePos("vt. 丢弃").label, "动词");
  assert.equal(parsePos("vi. 跑").label, "动词");
  assert.equal(parsePos("pron. 他").label, "代词");
  assert.equal(parsePos("prep. 在…上").label, "介词");
  assert.equal(parsePos("conj. 和").label, "连词");
  assert.equal(parsePos("num. 一").label, "数词");
  assert.equal(parsePos("art. 这").label, "冠词");
  assert.equal(parsePos("aux. 能").label, "助动词");
});

test("CET4 简写归一化：a.→形容词 ad.→副词", () => {
  assert.equal(parsePos("a. 好的").label, "形容词");
  assert.equal(parsePos("ad. 快速地").label, "副词");
  assert.equal(parsePos("adj. 美丽的").label, "形容词");
  assert.equal(parsePos("adv. 迅速地").label, "副词");
});

test("parsePos 无词性前缀返回 null", () => {
  assert.equal(parsePos("苹果"), null);
  assert.equal(parsePos(""), null);
  assert.equal(parsePos(undefined), null);
  assert.equal(parsePos(null), null);
});

test("stripPos 去掉词性前缀", () => {
  assert.equal(stripPos("n. 苹果；苹果树"), "苹果；苹果树");
  assert.equal(stripPos("vt. 丢弃；放弃"), "丢弃；放弃");
  assert.equal(stripPos("苹果"), "苹果");
});

test("firstMeaning 分号只取第一个", () => {
  assert.equal(firstMeaning("n. 苹果；苹果树"), "苹果");
  assert.equal(firstMeaning("vt. 丢弃；放弃"), "丢弃");
});

test("firstMeaning 编号义项只取第一个", () => {
  assert.equal(firstMeaning("n. 1.跑，奔跑 2.跑步，赛跑"), "跑，奔跑");
  assert.equal(firstMeaning("v. 1.是 2.存在 3.成为"), "是");
});

test("firstMeaning 词性组分隔只取第一组", () => {
  assert.equal(firstMeaning("prep. 在…里；在…上 | n. 里面"), "在…里");
});

test("firstMeaning 无分隔符返回原文", () => {
  assert.equal(firstMeaning("n. 苹果"), "苹果");
  assert.equal(firstMeaning("苹果"), "苹果");
});
