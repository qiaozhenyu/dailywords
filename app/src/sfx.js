/* ============================================================
   sfx.js — WebAudio 合成音效（无音频文件，规格见 SPEC §8.2）
   懒初始化 AudioContext（首次用户交互时），sfxOn=false 时静默。
   ============================================================ */
let ctx = null;
let enabled = true;

export function setSfxEnabled(on) {
  enabled = !!on;
}

/** 在用户手势里调用一次以解锁自动播放策略 */
export function unlockAudio() {
  ensureCtx();
}

function ensureCtx() {
  if (!ctx && typeof window !== "undefined" && window.AudioContext) {
    ctx = new AudioContext();
  }
  return ctx;
}

function tone(freq, dur = 0.08, type = "sine", delay = 0, gainPeak = 0.18) {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac || ac.state === "suspended") return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const t0 = ac.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** 正确按键 */
  correct() {
    tone(660, 0.045, "sine");
  },
  /** 连击（≥5 连续正确） */
  combo() {
    tone(880, 0.06, "sine");
  },
  /** 错误按键 */
  error() {
    tone(130, 0.09, "square", 0, 0.12);
  },
  /** 单词完成（双音上行） */
  wordDone() {
    tone(660, 0.12, "sine", 0, 0.2);
    tone(990, 0.14, "sine", 0.09, 0.2);
  },
  /** 复习答对（双音） */
  reviewRight() {
    tone(523, 0.1, "sine", 0, 0.16);
    tone(784, 0.12, "sine", 0.09, 0.16);
  },
  /** 复习答错 */
  reviewWrong() {
    tone(150, 0.12, "square", 0, 0.12);
  },
  /** 普通点击 */
  click() {
    tone(440, 0.03, "sine", 0, 0.08);
  }
};
