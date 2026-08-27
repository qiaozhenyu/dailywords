/* ============================================================
   views/review.js — 复习会话（规格 §7 §9.3 §9.7）
   两种模式：英译中（四选一）/ 中译英（默写，字母格空白不显示目标词）；最多 30% 来自错词本
   桌面快捷键：模式选择 1/2 · 英译中 1-4 选答案 · Space 发音 · Esc 返回/显示答案
   ============================================================ */
import { el, toast, celebrate, createTypingField, kbd, kbdHint, isSpaceKey } from "../ui.js";
import { state, learnedWords, wrongWordIds, recordReview } from "../state.js";
import { sampleReview, shuffle } from "../queues.js";
import { parsePos, stripPos, firstMeaning } from "../pos.js";
import { speak } from "../tts.js";
import { sfx } from "../sfx.js";
import { buzz, H } from "../haptics.js";
import { navigate } from "../router.js";

let mode = null; // "en2zh" | "zh2en"
let session = null; // { queue, idx, correct, wrong, retryMap }

// 视图生命周期：同一时刻只有一个 review 实例（路由切换时 destroy 清理）
let currentKeyHandler = null;
let currentTyping = null;
const timers = [];

function cleanupTyping() {
  if (currentTyping) {
    currentTyping.destroy();
    currentTyping = null;
  }
}

export function renderReview() {
  const root = el("div", { class: "learn-root" });
  const learned = learnedWords();

  if (learned.length === 0) {
    root.append(
      el("div", { class: "card empty-state" }, [
        el("div", { class: "emoji" }, "🌱"),
        el("div", {}, "还没有已学单词，先去「今日」学几个再回来复习吧！"),
        el("div", { class: "home-actions" }, [
          el("button", {
            class: "btn btn-primary btn-block",
            onclick: () => { sfx.click(); navigate("/learn"); }
          }, "去学习")
        ])
      ])
    );
    return { node: root, destroy };
  }

  if (!session) buildModeSelect(root);
  else buildSession(root);
  return { node: root, destroy };
}

function destroy() {
  cleanupTyping();
  if (currentKeyHandler) {
    document.removeEventListener("keydown", currentKeyHandler);
    currentKeyHandler = null;
  }
  timers.forEach((t) => clearTimeout(t));
  timers.length = 0;
}

function later(fn, ms) {
  timers.push(setTimeout(fn, ms));
}

/** 绑定视图内 keydown（自动替换上一阶段监听，避免重复触发） */
function bindKeydown(root, handler) {
  if (currentKeyHandler) document.removeEventListener("keydown", currentKeyHandler);
  currentKeyHandler = (e) => {
    if (root.isConnected) handler(e);
  };
  document.addEventListener("keydown", currentKeyHandler);
}

/* ---------- 模式选择 ---------- */
function buildModeSelect(root) {
  cleanupTyping();
  root.innerHTML = "";
  // 顶部：‹ 返回首页 + 标题
  root.append(
    el("div", { class: "learn-top" }, [
      el("button", { class: "back", onclick: () => { sfx.click(); navigate("/"); } }, "‹"),
      el("h2", { class: "page-title", style: "margin:0" }, "🔁 复习")
    ])
  );
  root.append(
    el("div", { class: "card" }, [
      el("div", { class: "card-sub" }, [
        `本轮随机抽 ${state.settings.reviewCount} 个已学词，最多 30% 来自错词本。`
      ]),
      el("div", { class: "mode-grid" }, [
        el("div", { class: "card mode-card", onclick: () => { sfx.click(); start("en2zh"); buildSession(root); } }, [
          el("div", { class: "mode-icon" }, "🇬🇧"),
          el("div", { class: "mode-name" }, ["英译中", kbd("1")]),
          el("div", { class: "mode-desc" }, "看英文选中文（四选一）")
        ]),
        el("div", { class: "card mode-card", onclick: () => { sfx.click(); start("zh2en"); buildSession(root); } }, [
          el("div", { class: "mode-icon" }, "🇨🇳"),
          el("div", { class: "mode-name" }, ["中译英", kbd("2")]),
          el("div", { class: "mode-desc" }, "看中文默写英文（打字）")
        ])
      ]),
      kbdHint("按 <kbd>1</kbd> 英译中 · <kbd>2</kbd> 中译英")
    ])
  );
  bindKeydown(root, (e) => {
    if (e.key === "1") { sfx.click(); start("en2zh"); buildSession(root); }
    else if (e.key === "2") { sfx.click(); start("zh2en"); buildSession(root); }
  });
}

function start(m) {
  mode = m;
  const learned = learnedWords();
  session = {
    queue: sampleReview(state.settings.reviewCount, learned, wrongWordIds()),
    idx: 0,
    correct: 0,
    wrong: 0,
    retryMap: new Map()
  };
  if (session.queue.length === 0) {
    toast("没有可复习的词");
    session = null;
  }
}

/* ---------- 会话 ---------- */
function buildSession(root) {
  if (!session) return buildModeSelect(root);
  cleanupTyping();
  root.innerHTML = "";
  const q = session.queue[session.idx];
  if (!q) {
    buildEndScreen(root);
    return;
  }

  const counter = el("span", { class: "learn-counter" }, `${session.idx + 1} / ${session.queue.length}`);
  const fill = el("div", { class: "progress-fill", style: `width:${(session.idx / session.queue.length) * 100}%` });
  root.append(
    el("div", { class: "learn-top" }, [
      el("button", { class: "back", onclick: () => { sfx.click(); session = null; buildModeSelect(root); } }, "‹"),
      el("div", { class: "learn-progress" }, [el("div", { class: "progress-track" }, [fill])]),
      counter
    ])
  );

  if (mode === "en2zh") buildEn2Zh(root, q);
  else buildZh2En(root, q);
}

function advance(root) {
  session.idx++;
  buildSession(root);
}

/* 英译中：四选一 */
function buildEn2Zh(root, word) {
  const prompt = el("div", { class: "card learn-card" }, [
    el("div", { class: "review-prompt" }, [
      word.word,
      word.phonetic ? el("span", { class: "phonetic" }, word.phonetic) : null
    ]),
    el("button", { class: "speak-btn", onclick: () => speak(word.word, null, { word }) }, "🔊")
  ]);
  root.append(prompt);

  // 干扰项：从已学词随机取 3 个不同释义
  const learned = learnedWords().filter((w) => w.word !== word.word && w.translation !== word.translation);
  const distractors = shuffle(learned).slice(0, 3).map((w) => w.translation);
  const options = shuffle([word.translation, ...distractors]);
  const list = el("div", { class: "option-list" });
  let locked = false;

  for (const opt of options) {
    const btn = el(
      "button",
      { class: "option", dataset: { value: opt }, onclick: () => pick(opt, btn) },
      [kbd(String(options.indexOf(opt) + 1)), opt]
    );
    list.append(btn);
  }

  function pick(opt, btn) {
    if (locked) return;
    locked = true;
    if (opt === word.translation) {
      btn.classList.add("right");
      sfx.reviewRight();
      buzz(H.correct);
      session.correct++;
      recordReview(word.word, true);
      later(() => advance(root), 700);
    } else {
      btn.classList.add("wrong");
      sfx.reviewWrong();
      buzz(H.error);
      session.wrong++;
      recordReview(word.word, false);
      for (const b of list.children) {
        if (b.dataset.value === word.translation) b.classList.add("right");
      }
      pushRetry(word);
      later(() => advance(root), 1300);
    }
  }
  root.append(list);
  root.append(kbdHint("按 <kbd>1</kbd>-<kbd>4</kbd> 选择 · <kbd>Space</kbd> 发音 · <kbd>Esc</kbd> 返回"));

  bindKeydown(root, (e) => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4 && !locked) {
      const btn = list.children[n - 1];
      if (btn) { e.preventDefault(); btn.click(); }
    } else if (isSpaceKey(e)) {
      e.preventDefault();
      speak(word.word, null, { word });
    } else if (e.key === "Escape") {
      session = null;
      buildModeSelect(root);
    }
  });
}

/* 中译英：默写打字（字母格空白，不显示目标词；不显示例句——复习纯回忆） */
function buildZh2En(root, word) {
  const pos = parsePos(word.translation);
  const prompt = el("div", { class: "card learn-card" }, [
    el("div", { class: "review-chinese" }, [
      pos ? el("span", { class: "pos-tag" }, [`${pos.icon} ${pos.label}`]) : null,
      el("span", { class: "chinese-text" }, firstMeaning(word.translation))
    ])
  ]);
  root.append(prompt);

  let typing = createTypingField({
    target: word.word,
    onKey: () => {
      sfx.correct();
      buzz(H.correct);
    },
    onError: () => {
      sfx.error();
      buzz(H.error);
      if (typing) {
        typing.root.classList.remove("shake");
        void typing.root.offsetWidth;
        typing.root.classList.add("shake");
      }
    },
    onDone: () => {
      sfx.reviewRight();
      buzz(H.wordDone);
      celebrate(prompt);
      session.correct++;
      recordReview(word.word, true);
      later(() => advance(root), 800);
    }
  });
  currentTyping = typing;
  root.append(typing.root);
  typing.focus();

  const actions = el("div", { class: "learn-actions" }, [
    el("button", {
      class: "btn btn-ghost",
      onclick: () => {
        speak(word.word, null, { word });
        typing.focus(); // 发音后焦点还给输入框，可直接继续打字
      }
    }, "🔊 发音"),
    el("button", {
      class: "btn btn-soft",
      onclick: () => {
        sfx.click();
        pushRetry(word);
        typing.reveal(); // 格子亮起展示答案
        later(() => advance(root), 900);
      }
    }, ["显示答案", kbd("Esc")])
  ]);
  root.append(actions);
  root.append(kbdHint("按 <kbd>Space</kbd> 发音 · <kbd>Esc</kbd> 显示答案"));

  bindKeydown(root, (e) => {
    if (isSpaceKey(e)) {
      // Space 发音（用户要求复习中也能空格发音）
      e.preventDefault();
      speak(word.word, null, { word });
      typing.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      const btn = actions.querySelector(".btn-soft");
      if (btn && !typing.getState().done) btn.click();
    }
  });
}

function pushRetry(word) {
  const retries = session.retryMap.get(word.word) || 0;
  if (retries < 2) {
    session.retryMap.set(word.word, retries + 1);
    session.queue.push(word);
  }
}

/* 结束页 */
function buildEndScreen(root) {
  root.innerHTML = "";
  const total = session.correct + session.wrong;
  const pct = total ? Math.round((session.correct / total) * 100) : 0;
  root.append(
    el("div", { class: "card done-banner" }, [
      el("div", { class: "emoji" }, pct >= 90 ? "🏆" : pct >= 60 ? "👍" : "💪"),
      el("h2", {}, pct >= 90 ? "太强了！" : pct >= 60 ? "不错！" : "继续加油！"),
      el("p", { class: "card-sub" }, [
        `答对 ${session.correct} · 答错 ${session.wrong} · 正确率 ${pct}%`
      ]),
      el("div", { class: "home-actions" }, [
        el("button", {
          class: "btn btn-primary btn-lg btn-block",
          onclick: () => {
            sfx.click();
            start(mode); // 同模式再来一轮
            buildSession(root);
          }
        }, ["再复习一轮", kbd("Enter")]),
        el("button", {
          class: "btn btn-ghost btn-lg btn-block",
          onclick: () => {
            sfx.click();
            session = null;
            buildModeSelect(root);
          }
        }, ["换个模式", kbd("Esc")]),
        el("button", {
          class: "btn btn-ghost btn-block",
          onclick: () => {
            sfx.click();
            session = null;
            navigate("/");
          }
        }, "🏠 回到首页")
      ]),
      kbdHint("按 <kbd>Enter</kbd> 再复习一轮 · <kbd>Esc</kbd> 换模式")
    ])
  );

  bindKeydown(root, (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sfx.click();
      start(mode);
      buildSession(root);
    } else if (e.key === "Escape") {
      session = null;
      buildModeSelect(root);
    }
  });
}
