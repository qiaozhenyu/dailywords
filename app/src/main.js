/* ============================================================
   main.js — 启动入口：初始化状态 → 装配路由/头部/Tab 栏 → 注册 SW
   ============================================================ */
import { initState, state } from "./state.js";
import { initRouter, register, currentPath } from "./router.js";
import { initTTS } from "./tts.js";
import { setSfxEnabled, unlockAudio } from "./sfx.js";
import { setHapticsEnabled } from "./haptics.js";
import { el } from "./ui.js";
import { renderHome } from "./views/home.js";
import { renderLearn } from "./views/learn.js";
import { renderInfinite } from "./views/infinite.js";
import { renderReview } from "./views/review.js";
import { renderGrammar } from "./views/grammar.js";
import { renderProgress } from "./views/progress.js";
import { renderSettings } from "./views/settings.js";

const TABS = [
  { path: "/", icon: "📖", label: "今日" },
  { path: "/review", icon: "🔁", label: "复习" },
  { path: "/grammar", icon: "📚", label: "语法" },
  { path: "/progress", icon: "📊", label: "进度" },
  { path: "/settings", icon: "⚙️", label: "设置" }
];

function applySettings() {
  setSfxEnabled(state.settings.sfxOn);
  setHapticsEnabled(state.settings.hapticsOn);
  initTTS(state.settings);
}

function buildHeader() {
  const streakBadge = el("span", { class: "streak", id: "header-streak" }, ["🔥 0 天"]);
  const header = el("header", { class: "app-header" }, [
    el("div", { class: "brand" }, ["DailyWords", el("em", {}, " 每日单词")]),
    streakBadge
  ]);
  return { header, streakBadge };
}

function buildTabbar() {
  const nav = el("nav", { class: "tabbar" });
  for (const t of TABS) {
    nav.append(
      el("a", { href: "#" + t.path, dataset: { path: t.path } }, [
        el("span", { class: "tab-icon" }, t.icon),
        el("span", {}, t.label)
      ])
    );
  }
  return nav;
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    const okHost = location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
    if (okHost) {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW 注册失败：", e));
    }
  }
}

async function boot() {
  await initState();
  applySettings();

  // 首次用户交互时解锁 AudioContext（浏览器自动播放策略）
  document.addEventListener("pointerdown", () => unlockAudio(), { once: true });

  register("/", () => renderHome(), {});
  register("/learn", () => renderLearn(), { hideTabbar: true });
  register("/infinite", () => renderInfinite(), { hideTabbar: true });
  register("/review", () => renderReview(), {});
  register("/grammar", () => renderGrammar(), {});
  register("/progress", () => renderProgress(), {});
  register("/settings", () => renderSettings(), {});

  const app = document.getElementById("app");
  const { header, streakBadge } = buildHeader();
  const main = el("main", { class: "app-main" });
  const tabbar = buildTabbar();
  app.append(header, main, tabbar);

  initRouter(main, (path, hideTabbar) => {
    tabbar.classList.toggle("hidden", !!hideTabbar);
    main.classList.toggle("no-tabbar", !!hideTabbar);
    for (const a of tabbar.querySelectorAll("a")) {
      a.classList.toggle("active", a.dataset.path === path);
    }
    streakBadge.textContent = `🔥 ${state.stats.streak || 0} 天`;
  });

  // 初始渲染
  const path = currentPath();
  for (const a of tabbar.querySelectorAll("a")) {
    a.classList.toggle("active", a.dataset.path === path);
  }
  streakBadge.textContent = `🔥 ${state.stats.streak || 0} 天`;

  registerSW();
}

boot();
