/* ============================================================
   ui.js — 轻量 DOM 工具：el 创建、toast、字母格打字组件（学习/复习共用）
   ============================================================ */
import { initTyping, pressKey } from "./typing.js";

/** 创建元素：el("div", {class:"x", onclick}, [children...])（自动展平嵌套数组） */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined) {
      node.setAttribute(k, v);
    }
  }
  const list = Array.isArray(children) ? children.flat(Infinity) : [children];
  for (const c of list) {
    if (c === null || c === undefined) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

let toastTimer = null;
/** 轻提示 */
export function toast(msg, ms = 2200) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = el("div", { class: "toast" });
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/** 键盘按键徽章（印在按钮上，规格 §9.7） */
export function kbd(text) {
  return el("kbd", {}, text);
}

/** 快捷键提示条（用 innerHTML 渲染 kbd，避免 <kbd> 被转义成字面量） */
export function kbdHint(html) {
  const div = el("div", { class: "kbd-hint" });
  div.innerHTML = html;
  return div;
}

/** 空格键兼容（部分浏览器 e.key 为 "Spacebar" 而非 " "） */
export function isSpaceKey(e) {
  return e.key === " " || e.key === "Spacebar";
}

/** 成功粒子庆祝（规格 §8.1） */
export function celebrate(originEl) {
  const colors = ["#4f46e5", "#16a34a", "#d97706", "#dc2626", "#818cf8", "#22c55e"];
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 20; i++) {
    const p = el("span", { class: "confetti" });
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 120;
    p.style.left = cx + "px";
    p.style.top = cy + "px";
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
    p.style.setProperty("--dy", Math.sin(angle) * dist - 40 + "px");
    p.style.setProperty("--rot", Math.random() * 720 - 360 + "deg");
    document.body.append(p);
    setTimeout(() => p.remove(), 850);
  }
}

/**
 * 字母格打字组件（学习默写与中译英复习共用，规格 §8）
 * 格子初始为空白（不显示目标字母），敲对才显示字母——真正的记忆测试。
 * @param {object} opts
 * @param {string} opts.target 目标单词
 * @param {Function} [opts.onKey] (result, state) => void 每次按键
 * @param {Function} [opts.onDone] (state) => void 全词完成
 * @param {Function} [opts.onError] (state) => void 敲错
 * @returns {{root: HTMLElement, focus: Function, reset: Function, destroy: Function, getState: Function, reveal: Function}}
 */
export function createTypingField({ target, onKey, onDone, onError }) {
  const cells = target.split("").map(() => el("span", { class: "letter-cell" }));

  const input = el("input", {
    class: "typing-input",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    inputmode: "text"
  });

  const area = el("div", { class: "typing-area" }, [
    el("div", { class: "letter-cells" }, cells),
    input
  ]);

  let state = initTyping(target);
  let lastErrorIdx = -1;
  let destroyed = false;
  const cleanup = [];

  function renderState() {
    cells.forEach((c, i) => {
      const lit = i < state.pos;
      const isCursor = i === state.pos && !state.done;
      c.textContent = lit ? target[i] : "";
      c.classList.toggle("lit", lit);
      c.classList.toggle("cursor", isCursor);
      c.classList.toggle("err", i === lastErrorIdx && i >= state.pos);
    });
  }

  function handleChars(chars) {
    for (const ch of chars) {
      if (state.done) break;
      const result = pressKey(state, ch);
      if (result.ok) {
        state = result.state;
        lastErrorIdx = -1;
        renderState();
        if (onKey) onKey(result, state);
        if (state.done) {
          if (onDone) onDone(state);
          break;
        }
      } else if (result.error === "mismatch") {
        state = result.state; // errors +1
        lastErrorIdx = state.pos;
        renderState();
        if (onError) onError(state);
      }
    }
  }

  function onInput() {
    const raw = input.value;
    if (!raw) return;
    input.value = "";
    handleChars(raw.split(""));
  }

  // 输入框失焦时，把桌面键盘按键转发回来（移动端软键盘靠 focus）
  function onDocKey(e) {
    if (destroyed) return;
    if (document.activeElement !== input && e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      e.preventDefault();
      input.focus({ preventScroll: true });
    }
  }

  input.addEventListener("input", onInput);
  document.addEventListener("keydown", onDocKey);
  cleanup.push(() => {
    input.removeEventListener("input", onInput);
    document.removeEventListener("keydown", onDocKey);
  });

  renderState();

  return {
    root: area,
    focus() {
      input.focus({ preventScroll: true });
    },
    reset() {
      state = initTyping(target);
      lastErrorIdx = -1;
      renderState();
    },
    /** 显示答案：所有格子亮起并显示完整单词（不触发 onDone） */
    reveal() {
      state = { ...state, pos: target.length, done: true };
      cells.forEach((c, i) => {
        c.textContent = target[i];
        c.classList.add("lit");
        c.classList.remove("err", "cursor");
      });
    },
    destroy() {
      destroyed = true;
      cleanup.forEach((f) => f());
      area.remove();
    },
    getState() {
      return state;
    }
  };
}
