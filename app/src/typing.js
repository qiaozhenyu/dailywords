/* ============================================================
   typing.js — 逐字母打字判定（纯逻辑，无 DOM，可 node --test 测试）
   规则：大小写不敏感；非字母字符忽略；敲错不前进（pos 不动）；
   全词敲完 done = true。
   ============================================================ */

/**
 * 初始化打字状态
 * @param {string} target 目标单词（原样传入，内部统一小写）
 * @returns {{target: string, pos: number, done: boolean, errors: number}}
 */
export function initTyping(target) {
  return { target: target.toLowerCase(), pos: 0, done: false, errors: 0 };
}

/**
 * 按下一个字符（字母）
 * @param {{target: string, pos: number, done: boolean, errors: number}} state 当前状态
 * @param {string} ch 用户敲入的单个字符
 * @returns {{ok: boolean, state: object, error: string|null}}
 *   ok=true  接受该字符，pos 前进（可能完成）
 *   ok=false 未接受，state.errors 可能 +1（mismatch）或不变（invalid/done）
 */
export function pressKey(state, ch) {
  if (state.done) return { ok: false, state, error: "done" };
  const c = ch.toLowerCase();
  if (!/^[a-z]$/.test(c)) return { ok: false, state, error: "invalid" };
  if (c === state.target[state.pos]) {
    const pos = state.pos + 1;
    return {
      ok: true,
      state: { ...state, pos, done: pos === state.target.length },
      error: null
    };
  }
  return { ok: false, state: { ...state, errors: state.errors + 1 }, error: "mismatch" };
}

/** 当前完成比例 0..1 */
export function typingProgress(state) {
  if (!state.target.length) return 1;
  return state.pos / state.target.length;
}

/** 是否已全部敲完 */
export function isTypingDone(state) {
  return state.done;
}
