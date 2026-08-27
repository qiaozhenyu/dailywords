/* ============================================================
   views/learn.js — 每日学习会话（规格 §6 §8 §9.2 §9.7）
   流程：取本日批次（顺延+打乱）→ 看（英文/音标/中文/发音）→ 逐字母默写 → 完成庆祝
   桌面快捷键：Enter 开始默写 · Space 发音 · Esc 显示答案/返回 · R 去复习
   ============================================================ */
import { el, toast, celebrate, createTypingField, kbd, isSpaceKey } from "../ui.js";
import { state, markLearned } from "../state.js";
import { getNextBatch } from "../queues.js";
import { parsePos, stripPos, firstMeaning } from "../pos.js";
import { speak } from "../tts.js";
import { sfx } from "../sfx.js";
import { buzz, H } from "../haptics.js";
import { navigate } from "../router.js";

export function renderLearn() {
  const root = el("div", { class: "learn-root" });
  const cleanup = [];
  const timers = [];
  const hint = el("div", { class: "kbd-hint" });
  let phase = "look"; // look | type | summary

  // 已学集合（仅 status === "learned" 才算学过）
  const learnedSet = new Set();
  for (const [id, rec] of state.progressMap) if (rec.status === "learned") learnedSet.add(id);
  const batch = getNextBatch(state.settings.dailyQuota, state.words, learnedSet);

  if (batch.length === 0) {
    root.append(hint);
    root.append(completedLibrary());
    return root;
  }

  const session = {
    queue: batch.slice(),
    idx: 0,
    done: 0,
    skipped: 0,
    retryMap: new Map(), // word -> 已跳过次数（最多 2 次）
    dotCount: batch.length
  };

  let typing = null;
  let combo = 0; // 连续正确数（≥5 触发连击音效，规格 §8.1）

  const counter = el("span", { class: "learn-counter" }, `1 / ${session.dotCount}`);
  const fill = el("div", { class: "progress-fill", style: "width:0%" });
  const top = el("div", { class: "learn-top" }, [
    el("button", { class: "back", onclick: () => { sfx.click(); navigate("/"); } }, "‹"),
    el("div", { class: "learn-progress" }, [el("div", { class: "progress-track" }, [fill])]),
    counter
  ]);
  const dots = el("div", { class: "dot-row" });
  const card = el("div", { class: "card learn-card" });
  root.append(top, dots, card, hint);

  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }

  function renderDots() {
    dots.innerHTML = "";
    for (let i = 0; i < session.dotCount; i++) {
      dots.append(
        el("span", {
          class: "dot" + (i < session.done ? " done" : i === session.done ? " current" : "")
        })
      );
    }
  }

  function updateProgress() {
    renderDots();
    counter.textContent = `${Math.min(session.done + 1, session.dotCount)} / ${session.dotCount}`;
    fill.style.width = session.dotCount ? `${(session.done / session.dotCount) * 100}%` : "100%";
  }

  function currentWord() {
    return session.queue[session.idx];
  }

  /** 发音（按钮与快捷键共用）；发音后自动把焦点还给输入框，保证能直接继续打字 */
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
    if (typing && phase === "type") typing.focus();
  }

  function advance() {
    session.idx++;
    if (session.idx >= session.queue.length) {
      showSummary();
      return;
    }
    showWord(session.queue[session.idx]);
  }

  function showWord(word) {
    phase = "look";
    if (typing) typing.destroy();
    typing = null;
    combo = 0;
    card.innerHTML = "";

    // 四行布局（规格 §9.2）：中文+词性标签 / 英文 / 音标 / 示例短句，四行颜色不同
    const pos = parsePos(word.translation);
    const chineseEl = el("div", { class: "word-chinese" }, [
      pos ? el("span", { class: "pos-tag" }, [`${pos.icon} ${pos.label}`]) : null,
      el("span", { class: "chinese-text" }, firstMeaning(word.translation))
    ]);
    const wordEl = el("div", { class: "word-display" }, word.word);
    const phoneticEl = word.phonetic
      ? el("div", { class: "word-phonetic" }, word.phonetic)
      : null;
    const speakBtn = el("button", { class: "speak-btn", onclick: () => speakCurrent() }, "🔊");
    const exampleEl = word.example
      ? el("div", { class: "word-example" }, word.example)
      : null;
    const actions = el("div", { class: "learn-actions" });

    card.append(chineseEl);
    card.append(wordEl);
    if (phoneticEl) card.append(phoneticEl);
    card.append(speakBtn);
    if (exampleEl) card.append(exampleEl);
    card.append(actions);

    // 自动发音（设置 autoSpeak）
    if (state.settings.autoSpeak) {
      later(() => speakCurrent(), 350);
    }

    actions.append(
      el("button", {
        class: "btn btn-primary btn-lg",
        onclick: () => { sfx.click(); toTypePhase(word); }
      }, ["开始默写", kbd("Enter")])
    );
    updateHint("按 <kbd>Enter</kbd> 开始默写 · <kbd>Space</kbd> 发音 · <kbd>Esc</kbd> 返回");
  }

  /**
   * 进入打字阶段（renderLearn 级函数，供按钮与键盘快捷键共用）
   * 注意：必须定义在 renderLearn 作用域——否则键盘处理器引用不到（ReferenceError 被吞 = 回车无效）
   */
  function toTypePhase(word) {
    // 参数校验必须放在任何状态修改之前：避免"执行一半"的坏状态
    if (phase !== "look") return; // 幂等保护：防按钮聚焦 + Enter 双触发
    if (!word || typeof word.word !== "string") return;
    phase = "type";
    const wordEl = card.querySelector(".word-display");
    const actions = card.querySelector(".learn-actions");
    if (!wordEl || !actions) return;
    typing = createTypingField({
      target: word.word,
      onKey: (_result, st) => {
        combo += 1;
        sfx.correct();
        buzz(H.correct);
        if (combo >= 5) sfx.combo();
      },
      onError: () => {
        combo = 0;
        sfx.error();
        buzz(H.error);
        if (typing) {
          typing.root.classList.remove("shake");
          void typing.root.offsetWidth; // 重启动画
          typing.root.classList.add("shake");
        }
      },
      onDone: () => onWordDone(word)
    });
    // 打字区占据英文的位置（中文/音标/例句保持不变）
    wordEl.replaceWith(typing.root);
    typing.focus();
    actions.innerHTML = "";
    actions.append(
      el("button", {
        class: "btn btn-ghost",
        onclick: () => { sfx.click(); speakCurrent(); }
      }, ["🔊 发音", kbd("Space")]),
      el("button", {
        class: "btn btn-soft",
        onclick: () => { sfx.click(); onReveal(word); }
      }, ["显示答案", kbd("Esc")])
    );
    updateHint("按 <kbd>Space</kbd> 发音 · <kbd>Esc</kbd> 显示答案");
  }

  /** 默写完成：标记掌握 + 庆祝 + 进入下一词 */
  function onWordDone(word) {
    sfx.wordDone();
    buzz(H.wordDone);
    celebrate(card);
    session.done += 1;
    markLearned(word.word).then(() => {
      updateProgress();
      later(advance, 900);
    });
  }

  /** 显示答案并跳过：该词不标记 learned，本轮末尾重出（最多 2 次） */
  function onReveal(word) {
    if (phase !== "type") return; // 幂等保护
    sfx.click();
    const retries = session.retryMap.get(word.word) || 0;
    if (retries < 2) {
      session.retryMap.set(word.word, retries + 1);
      session.queue.push(word); // 追加到本轮末尾
      session.skipped += 1;
    }
    // 展示答案：打字区亮起显示完整英文（中文一直可见）
    if (typing) typing.reveal();
    later(advance, 800);
  }

  function showSummary() {
    phase = "summary";
    if (typing) typing.destroy();
    typing = null;
    top.style.display = "none";
    dots.style.display = "none";
    card.classList.remove("learn-card");
    card.innerHTML = "";
    card.append(
      el("div", { class: "done-banner" }, [
        el("div", { class: "emoji" }, "🎉"),
        el("h2", {}, "本轮完成！"),
        el("p", { class: "card-sub" }, [
          `学会 ${session.done} 个 · 跳过 ${session.skipped} 个`,
          el("br"),
          session.skipped > 0 ? "跳过的词明天会再出现，别担心" : "明天继续，保持节奏 🔥"
        ]),
        el("div", { class: "home-actions" }, [
          el("button", {
            class: "btn btn-primary btn-lg btn-block",
            onclick: () => { sfx.click(); navigate("/"); }
          }, ["回到首页", kbd("Enter")]),
          el("button", {
            class: "btn btn-soft btn-lg btn-block",
            onclick: () => { sfx.click(); navigate("/review"); }
          }, ["去复习", kbd("R")])
        ])
      ])
    );
    updateHint("按 <kbd>Enter</kbd> 回到首页 · <kbd>R</kbd> 去复习");
  }

  function completedLibrary() {
    return el("div", { class: "card done-banner" }, [
      el("div", { class: "emoji" }, "🏆"),
      el("h2", {}, "词库学完！"),
      el("p", { class: "card-sub" }, "3500 个词全部掌握，太强了！去复习保持记忆，或等二期内容。"),
      el("div", { class: "home-actions" }, [
        el("button", {
          class: "btn btn-primary btn-lg btn-block",
          onclick: () => { sfx.click(); navigate("/"); }
        }, "回到首页")
      ])
    ]);
  }

  function updateHint(html) {
    hint.innerHTML = html;
  }

  // —— 桌面键盘快捷键（规格 §9.7）——
  // 注：动作不依赖音效/震动，任何反馈异常都不应吞掉快捷键动作（try/catch 兜底）
  const onKey = (e) => {
    try {
      if (phase === "look") {
        if (e.key === "Enter") {
          e.preventDefault();
          toTypePhase(currentWord()); // 必须传当前词：toTypePhase 依赖 word.word
        } else if (isSpaceKey(e)) {
          e.preventDefault();
          speakCurrent();
        } else if (e.key === "Escape") {
          navigate("/");
        }
      } else if (phase === "type") {
        if (isSpaceKey(e)) {
          e.preventDefault();
          speakCurrent(); // Space 任何时候都发音（含输入框聚焦时，空格本就不能输入）
        } else if (e.key === "Escape") {
          e.preventDefault();
          onReveal(currentWord());
        }
      } else if (phase === "summary") {
        if (e.key === "Enter") {
          e.preventDefault();
          navigate("/");
        } else if (e.key.toLowerCase() === "r") {
          e.preventDefault();
          navigate("/review");
        }
      }
    } catch (err) {
      // 错误必须可见（不能静默吞掉，否则表现为"按了没反应"）
      console.error("快捷键处理异常:", err);
      toast("快捷键出错了，请刷新重试（详见控制台）");
    }
  };
  document.addEventListener("keydown", onKey);
  cleanup.push(() => document.removeEventListener("keydown", onKey));

  updateProgress();
  showWord(session.queue[0]);

  return {
    node: root,
    destroy() {
      cleanup.forEach((f) => f());
      timers.forEach((t) => clearTimeout(t));
      if (typing) typing.destroy();
    }
  };
}
