/* ============================================================
   views/settings.js — 设置（规格 §9.6）
   每日配额/复习数/发音选项/反馈开关/数据备份/清空
   ============================================================ */
import { el, toast } from "../ui.js";
import { state, updateSettings, exportBackupFile, importBackupFile, resetAll } from "../state.js";
import { isSupported as ttsSupported, getVoices, getCurrentVoiceName, isVoiceRemote, initTTS, speak } from "../tts.js";
import { setSfxEnabled } from "../sfx.js";
import { setHapticsEnabled } from "../haptics.js";
import { sfx } from "../sfx.js";

let voicesBound = false;

export function renderSettings() {
  const root = el("div", {});
  root.append(el("h2", { class: "page-title" }, "⚙️ 设置"));

  /* ---- 学习计划 ---- */
  root.append(
    section("学习计划", [
      field("每日新词数", [
        el("input", {
          type: "number", min: 1, max: 100,
          value: state.settings.dailyQuota,
          onchange: (e) => save({ dailyQuota: clamp(1, 100, +e.target.value) })
        })
      ]),
      field("复习数量", [
        el("input", {
          type: "number", min: 1, max: 100,
          value: state.settings.reviewCount,
          onchange: (e) => save({ reviewCount: clamp(1, 100, +e.target.value) })
        })
      ]),
      field("语法解锁阈值（累计掌握词数）", [
        el("input", {
          type: "number", min: 100, max: 3500,
          value: state.settings.grammarUnlockAt,
          onchange: (e) => save({ grammarUnlockAt: clamp(100, 3500, +e.target.value) })
        })
      ])
    ])
  );

  /* ---- 发音 ---- */
  const currentVoiceEl = el("div", { class: "switch-sub", id: "current-voice" });
  const voiceSelect = el("select", {
    onchange: (e) => {
      save({ voiceURI: e.target.value });
      initTTS(state.settings); // 立即生效，无需刷新
      refreshCurrentVoice();
    }
  });
  const prefSelect = el("select", {
    onchange: (e) => {
      save({ voicePreference: e.target.value });
      initTTS(state.settings);
      refreshCurrentVoice();
    }
  });
  // 语音偏好选项
  for (const [val, label] of [
    ["auto", "自动（优先美音·自然发音）"],
    ["en-US", "美音 English (US)"],
    ["en-GB", "英音 English (UK)"]
  ]) {
    prefSelect.append(el("option", { value: val }, label));
  }
  prefSelect.value = state.settings.voicePreference || "auto";

  const populateVoices = () => {
    const vs = getVoices();
    if (!vs.length) return;
    voiceSelect.innerHTML = "";
    voiceSelect.append(el("option", { value: "" }, "自动选择（推荐）"));
    for (const v of vs) {
      voiceSelect.append(el("option", { value: v.voiceURI }, `${v.name} (${v.lang})`));
    }
    voiceSelect.value = state.settings.voiceURI || "";
    refreshCurrentVoice();
  };
  function refreshCurrentVoice() {
    const name = getCurrentVoiceName();
    currentVoiceEl.textContent = `当前：${name}`;
    // 在线合成语音提示（Google / Microsoft Online 需网络，国内需 VPN）
    if (isVoiceRemote()) {
      currentVoiceEl.innerHTML =
        `当前：${name}<br><span class="switch-sub" style="color:var(--color-warn)">⚠️ 该语音为在线合成，发音可能需要科学上网；可下拉选择本地语音（如 Samantha）</span>`;
    }
  }
  populateVoices();
  if (ttsSupported() && !voicesBound && "speechSynthesis" in window) {
    window.speechSynthesis.addEventListener("voiceschanged", populateVoices);
    voicesBound = true;
  }

  root.append(
    section("发音", [
      field("语音偏好", [prefSelect]),
      field("语音", [
        el("div", { class: "voice-row" }, [
          el("div", { style: "flex:1" }, [voiceSelect]),
          el("button", {
            class: "btn btn-sm btn-soft",
            title: "试听当前语音",
            onclick: () => { sfx.click(); speak("Hello! How are you today?"); }
          }, "🔊 试听"),
          el("button", {
            class: "btn btn-sm btn-ghost",
            title: "重新加载语音列表",
            onclick: () => { sfx.click(); populateVoices(); initTTS(state.settings); }
          }, "刷新")
        ]),
        currentVoiceEl
      ]),
      field(`语速 ${state.settings.rate.toFixed(1)}`, [
        el("input", {
          type: "range", min: 0.5, max: 1.5, step: 0.1,
          value: state.settings.rate,
          oninput: (e) => save({ rate: +e.target.value })
        })
      ]),
      field(`音调 ${state.settings.pitch.toFixed(1)}`, [
        el("input", {
          type: "range", min: 0.5, max: 1.5, step: 0.1,
          value: state.settings.pitch,
          oninput: (e) => save({ pitch: +e.target.value })
        })
      ]),
      switchRow("卡片自动发音", "每次出现新词自动朗读", state.settings.autoSpeak, (v) => save({ autoSpeak: v }))
    ])
  );

  /* ---- 反馈 ---- */
  root.append(
    section("打字反馈", [
      switchRow("按键音效", "逐字母打字的音效", state.settings.sfxOn, (v) => {
        save({ sfxOn: v });
        setSfxEnabled(v);
      }),
      switchRow("手机震动", "支持震动的设备生效", state.settings.hapticsOn, (v) => {
        save({ hapticsOn: v });
        setHapticsEnabled(v);
      })
    ])
  );

  /* ---- 数据 ---- */
  const fileInput = el("input", {
    type: "file", accept: "application/json", style: "display:none",
    onchange: (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      importBackupFile(f).then((ok) => {
        toast(ok ? "导入成功 ✅" : "导入失败：文件格式不对");
        if (ok) location.hash = "#/";
      });
    }
  });
  root.append(fileInput);

  root.append(
    section("数据", [
      el("div", { class: "danger-zone" }, [
        el("button", {
          class: "btn btn-soft btn-block",
          onclick: () => { sfx.click(); exportBackupFile().then(() => toast("备份已下载 📦")); }
        }, "📦 导出备份（JSON）"),
        el("button", {
          class: "btn btn-ghost btn-block",
          onclick: () => { sfx.click(); fileInput.click(); }
        }, "📥 导入备份"),
        el("button", {
          class: "btn btn-ghost btn-block",
          onclick: () => {
            sfx.click();
            if (confirm("确定清空全部学习进度？此操作不可恢复，建议先导出备份。")) {
              resetAll().then(() => { toast("已清空"); location.hash = "#/"; });
            }
          }
        }, "🗑️ 清空全部进度")
      ])
    ])
  );

  root.append(
    el("div", { class: "card-sub", style: "text-align:center" }, [
      "DailyWords v0.1 · 数据仅存于本机浏览器 · 3500 高频词",
      el("br"),
      el("a", { href: "https://github.com/skywind3000/ECDICT", target: "_blank", rel: "noopener" }, "词库来源：ECDICT")
    ])
  );

  return root;
}

/* ---------- 小工具 ---------- */
function section(title, children) {
  return el("div", { class: "settings-section" }, [
    el("h3", {}, title),
    el("div", { class: "card" }, children)
  ]);
}

function field(label, controls) {
  return el("div", { class: "field" }, [
    el("label", {}, label),
    ...controls
  ]);
}

function switchRow(label, sub, checked, onChange) {
  return el("div", { class: "switch-row" }, [
    el("div", {}, [
      el("div", { class: "switch-label" }, label),
      el("div", { class: "switch-sub" }, sub)
    ]),
    el("label", { class: "switch" }, [
      el("input", {
        type: "checkbox", checked,
        onchange: (e) => onChange(e.target.checked)
      }),
      el("span", { class: "track" })
    ])
  ]);
}

function clamp(min, max, v) {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

async function save(patch) {
  await updateSettings(patch);
  state.settings = { ...state.settings, ...patch };
}
