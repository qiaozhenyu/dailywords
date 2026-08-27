/* ============================================================
   tts.js — 发音（Web Speech API，规格见 SPEC §10）
   健壮性要点：
   - 只保存 voiceURI（字符串），每次 speak 前重新 getVoices() 解析 fresh 引用
     —— 修复 Chrome 已知 bug：陈旧 voice 对象引用会导致 speak() 静默失败（无声无错）。
   - 默认语音选择：按「语音偏好（美音/英音/自动）」过滤，再按自然发音优先名单排序。
   - 不支持 TTS 时 toast 提示（不再静默失败）。
   - 预留：words.json 条目带 audio 字段（真人发音 URL）时优先播放（二期）。
   ============================================================ */
import { toast } from "./ui.js";

let voiceURI = ""; // 当前选中的语音（voiceURI 字符串，非对象引用）
let rate = 0.9;
let pitch = 1.0;
let lastWordAudio = null;

/** 自然发音优先名单（越靠前越优先；按名称包含匹配） */
const VOICE_PRIORITY = [
  "google us english",
  "google uk english female",
  "google uk english male",
  "microsoft aria",
  "microsoft jenny",
  "microsoft guy",
  "microsoft zira",
  "microsoft david",
  "microsoft sonia",
  "samantha",
  "victoria",
  "allison",
  "ava",
  "susan",
  "aaron",
  "daniel",
  "karen",
  "moira",
  "fiona",
  "oliver"
];

function voiceScore(v) {
  const n = v.name.toLowerCase();
  const idx = VOICE_PRIORITY.findIndex((p) => n.includes(p));
  return idx === -1 ? 999 : idx;
}

export function isSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function enVoices() {
  if (!isSupported()) return [];
  return window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
}

/** 解析当前生效语音的 fresh 引用（每次 speak 前调用，防陈旧引用） */
function resolveVoice() {
  const vs = enVoices();
  if (!vs.length) return null;
  if (voiceURI) {
    const v = vs.find((x) => x.voiceURI === voiceURI);
    if (v) return v;
  }
  return null;
}

export function initTTS(settings) {
  if (!isSupported()) return;
  rate = settings.rate ?? 0.9;
  pitch = settings.pitch ?? 1.0;
  const pick = () => {
    const vs = enVoices();
    if (!vs.length) {
      voiceURI = "";
      return;
    }
    // 用户显式指定 → 优先
    if (settings.voiceURI && vs.some((v) => v.voiceURI === settings.voiceURI)) {
      voiceURI = settings.voiceURI;
      return;
    }
    // 偏好过滤（美音/英音/自动）
    let pool = vs;
    const pref = settings.voicePreference || "auto";
    if (pref === "en-US") {
      pool = pool.filter((v) => /^en-US/i.test(v.lang));
    } else if (pref === "en-GB") {
      pool = pool.filter((v) => /^en-GB/i.test(v.lang));
    } else {
      const us = pool.filter((v) => /^en-US/i.test(v.lang));
      const gb = pool.filter((v) => /^en-GB/i.test(v.lang));
      const other = pool.filter((v) => !/^en-US/i.test(v.lang) && !/^en-GB/i.test(v.lang));
      pool = [...us, ...gb, ...other];
    }
    pool.sort((a, b) => voiceScore(a) - voiceScore(b));
    voiceURI = pool[0] ? pool[0].voiceURI : "";
  };
  pick();
  // 语音列表异步加载时重新挑选
  window.speechSynthesis.onvoiceschanged = pick;
}

/** 可用英文语音列表（供设置页选择） */
export function getVoices() {
  return enVoices();
}

/** 当前生效语音的名称（设置页展示） */
export function getCurrentVoiceName() {
  const fresh = resolveVoice();
  if (!fresh) return "未检测到英文语音";
  return `${fresh.name} (${fresh.lang})`;
}

/** 当前语音是否「在线合成」（Google / Microsoft Online 等，需网络/VPN） */
export function isVoiceRemote() {
  const fresh = resolveVoice();
  if (!fresh) return false;
  return /google|online \(natural\)|online/i.test(fresh.name);
}

/**
 * 朗读一段文本。返回 true 表示已发起。
 * @param {string} text 要朗读的文本
 * @param {Function} [onEnd] 结束回调
 * @param {{word?: string}} [opts] 预留：可传词对象取真人音频
 */
export function speak(text, onEnd, opts = {}) {
  // 二期预留：真人发音音频优先
  const audioUrl = opts.word && opts.word.audio;
  if (audioUrl) {
    if (lastWordAudio) lastWordAudio.pause();
    const a = new Audio(audioUrl);
    lastWordAudio = a;
    a.play().catch(() => {});
    a.onended = () => onEnd && onEnd();
    return true;
  }
  if (!isSupported()) {
    toast("当前浏览器不支持发音");
    if (onEnd) onEnd();
    return false;
  }
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  // 关键：用 fresh 引用（防 Chrome 陈旧 voice 对象静默失败）
  const fresh = resolveVoice();
  u.lang = fresh ? fresh.lang : "en-US";
  if (fresh) u.voice = fresh;
  u.rate = rate;
  u.pitch = pitch;
  let done = false;
  const finish = () => {
    if (!done) {
      done = true;
      if (onEnd) onEnd();
    }
  };
  u.onend = finish;
  u.onerror = (e) => {
    console.warn("发音失败:", e.error || e);
    finish();
  };
  try {
    synth.cancel(); // 防连点叠加
    synth.speak(u);
  } catch (e) {
    console.error("speak 异常:", e);
    finish();
  }
  // 静默失败兜底：200ms 后仍未开始播放 → 重试一次（Chrome cancel+speak 丢句 bug）
  window.setTimeout(() => {
    if (!done && !synth.speaking && !synth.pending) {
      try {
        synth.speak(u);
      } catch (e) {
        console.error("speak 重试异常:", e);
      }
    }
  }, 200);
  return true;
}
