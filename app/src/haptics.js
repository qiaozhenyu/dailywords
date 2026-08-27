/* ============================================================
   haptics.js — 手机震动反馈（规格见 SPEC §8.3）
   无 navigator.vibrate 的环境静默降级。
   ============================================================ */
let enabled = true;

export function setHapticsEnabled(on) {
  enabled = !!on;
}

export function buzz(pattern) {
  if (!enabled) return;
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch (_) {
      /* 忽略：部分浏览器可能抛异常 */
    }
  }
}

/** 震动模式表（与 SPEC §8.3 一致） */
export const H = {
  correct: 10,
  error: [30, 50, 30],
  wordDone: [20, 40, 20, 40, 80]
};
