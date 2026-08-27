/* ============================================================
   views/infinite.js — 无限模式（规格 §9.8）
   全词库随机出题、看中文打英文；答对得分（连击倍率），无限答题。
   快捷键：Space 发音 · Esc 结束
   ============================================================ */
import { el, celebrate, createTypingField, kbd, isSpaceKey } from "../ui.js";
import { state, saveInfiniteBest } from "../state.js";
import { shuffle } from "../queues.js";
import { parsePos, stripPos, firstMeaning } from "../pos.js";
import { speak } from "../tts.js";
import { sfx } from "../sfx.js";
import { buzz, H } from "../haptics.js";
import { navigate } from "../router.js";

export function renderInfinite() {
  const root = el("div", { class: "learn-root" });
  const cleanup = [];
  const timers = [];
  const hint = el("div", { class: "kbd-hint" });

  const game = {
    queue: [],
    idx: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    correct: 0,
    total: 0,
    startedAt: Date.now()
  };

  let typing = null;
  let phase = "play"; // play | summary

  const scoreEl = el("span", { class: "infinite-score" }, "0");
  const comboEl = el("span", { class: "infinite-combo" });
  const countEl = el("span", { class: "infinite-count" }, "0 题");
  const top = el("div", { class: "infinite-top" }, [
    el("div", {}, [scoreEl, comboEl]),
    countEl,
    el("button", {
      class: "btn btn-ghost btn-sm",
      onclick: () => { sfx.click(); showSummary(); }
    }, "结束")
  ]);
  const card = el("div", { class: "card learn-card", id: "infinite-card" });
  root.append(top, card, hint);

  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }

  /** 词池耗尽时补一批（避免相邻重复） */
  function ensureQueue() {
    if (game.idx < game.queue.length) return;
    let q = shuffle(state.words);
    if (q.length > 1 && q[0].word === lastWord()) {
      q = [q[1], q[0], ...q.slice(2)];
    }
    game.queue = q;
    game.idx = 0;
  }

  function lastWord() {
    return game.idx > 0 ? game.queue[game.idx - 1]?.word : null;
  }

  function currentWord() {
    ensureQueue();
    return game.queue[game.idx];
  }

  function multiplier() {
    if (game.combo >= 10) return 3;
    if (game.combo >= 5) return 2;
    return 1;
  }

  function renderScore() {
    scoreEl.textContent = String(game.score);
    const mult = multiplier();
    comboEl.textContent = game.combo >= 5 ? ` 🔥 ×${mult} 连击 ${game.combo}` : "";
    countEl.textContent = `${game.total} 题`;
  }

  function advance() {
    game.idx++;
    if (phase !== "play") return;
    showWord(currentWord());
  }

  function speakCurrent() {
    const w = currentWord();
    if (!w) return;
    const btn = card.querySelector(".speak-btn");
    if (btn) {
      btn.classList.add("speaking");
      speak(w.word, () => btn.classList.remove("speaking"), { word: w });
    } else {
      speak(w.word, null, { word: w });
    }
    if (typing) typing.focus();
  }

  function showWord(word) {
    if (typing) typing.destroy();
    typing = null;
    card.innerHTML = "";

    const pos = parsePos(word.translation);
    card.append(
      el("div", { class: "word-chinese" }, [
        pos ? el("span", { class: "pos-tag" }, [`${pos.icon} ${pos.label}`]) : null,
        el("span", { class: "chinese-text" }, firstMeaning(word.translation))
      ])
    );

    typing = createTypingField({
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
      onDone: () => onWordDone(word)
    });
    card.append(typing.root);
    typing.focus();

    const actions = el("div", { class: "learn-actions" }, [
      el("button", {
        class: "btn btn-ghost",
        onclick: () => { sfx.click(); speakCurrent(); }
      }, ["🔊 发音", kbd("Space")]),
      el("button", {
        class: "btn btn-soft",
        onclick: () => { sfx.click(); onReveal(word); }
      }, ["显示答案", kbd("Esc")])
    ]);
    card.append(actions);
    updateHint("按 <kbd>Space</kbd> 发音 · <kbd>Esc</kbd> 结束");
  }

  function onWordDone(word) {
    game.combo += 1;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    game.correct += 1;
    game.total += 1;
    const mult = multiplier();
    game.score += 10 * mult;
    renderScore();
    sfx.wordDone();
    buzz(H.wordDone);
    if (game.combo >= 5) sfx.combo();
    celebrate(card);
    later(advance, 550);
  }

  function onReveal(word) {
    sfx.click();
    game.combo = 0;
    game.total += 1;
    renderScore();
    if (typing) typing.reveal();
    later(advance, 800);
  }

  function showSummary() {
    if (phase !== "play") return;
    phase = "summary";
    if (typing) typing.destroy();
    typing = null;
    timers.forEach((t) => clearTimeout(t));
    timers.length = 0;
    const secs = Math.max(1, Math.round((Date.now() - game.startedAt) / 1000));
    const acc = game.total ? Math.round((game.correct / game.total) * 100) : 0;
    saveInfiniteBest({
      score: game.score,
      bestCombo: game.bestCombo,
      correct: game.correct
    });
    top.style.display = "none";
    card.classList.remove("learn-card");
    card.innerHTML = "";
    card.append(
      el("div", { class: "done-banner" }, [
        el("div", { class: "emoji" }, game.score >= 500 ? "🏆" : game.score >= 200 ? "🔥" : "💪"),
        el("h2", {}, `${game.score} 分`),
        el("p", { class: "card-sub" }, [
          `答对 ${game.correct} / ${game.total}（正确率 ${acc}%）· 最高连击 ${game.bestCombo} · 用时 ${secs} 秒`
        ]),
        el("div", { class: "home-actions" }, [
          el("button", {
            class: "btn btn-primary btn-lg btn-block",
            onclick: () => { sfx.click(); restart(); }
          }, ["再来一局", kbd("Enter")]),
          el("button", {
            class: "btn btn-ghost btn-lg btn-block",
            onclick: () => { sfx.click(); navigate("/"); }
          }, "回到首页")
        ])
      ])
    );
    updateHint("按 <kbd>Enter</kbd> 再来一局 · <kbd>Esc</kbd> 回首页");
  }

  function restart() {
    phase = "play";
    game.queue = [];
    game.idx = 0;
    game.score = 0;
    game.combo = 0;
    game.bestCombo = 0;
    game.correct = 0;
    game.total = 0;
    game.startedAt = Date.now();
    top.style.display = "";
    card.classList.add("learn-card");
    renderScore();
    showWord(currentWord());
    updateHint("按 <kbd>Space</kbd> 发音 · <kbd>Esc</kbd> 结束");
  }

  function updateHint(html) {
    hint.innerHTML = html;
  }

  const onKey = (e) => {
    try {
      if (phase === "play") {
        if (isSpaceKey(e)) {
          e.preventDefault();
          speakCurrent();
        } else if (e.key === "Escape") {
          e.preventDefault();
          showSummary();
        }
      } else if (phase === "summary") {
        if (e.key === "Enter") {
          e.preventDefault();
          restart();
        } else if (e.key === "Escape") {
          e.preventDefault();
          navigate("/");
        }
      }
    } catch (err) {
      console.error("无限模式快捷键异常:", err);
    }
  };
  document.addEventListener("keydown", onKey);
  cleanup.push(() => document.removeEventListener("keydown", onKey));

  renderScore();
  showWord(currentWord());

  return {
    node: root,
    destroy() {
      cleanup.forEach((f) => f());
      timers.forEach((t) => clearTimeout(t));
      if (typing) typing.destroy();
    }
  };
}
