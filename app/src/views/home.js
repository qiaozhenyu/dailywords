/* ============================================================
   views/home.js — 今日首页（规格 §9.1）
   桌面端卡片双列网格；Enter 快捷键开始学习。
   ============================================================ */
import { el, kbd } from "../ui.js";
import { state, learnedCount, todayLearnedCount, wrongWordIds } from "../state.js";
import { navigate } from "../router.js";
import { sfx } from "../sfx.js";

export function renderHome() {
  const learned = learnedCount();
  const total = state.words.length;
  const quota = state.settings.dailyQuota;
  const today = todayLearnedCount();
  const wrongCount = wrongWordIds().length;
  const completed = total > 0 && learned >= total;
  const grammarUnlocked = learned >= state.settings.grammarUnlockAt;

  const root = el("div", {});
  const cleanup = [];

  // 顶部概览
  root.append(
    el("div", { class: "home-hero" }, [
      el("div", { class: "big-num" }, `${learned} / ${total}`),
      el("div", { class: "sub" }, total ? "已掌握词数" : "词库加载中…")
    ])
  );

  const grid = el("div", { class: "home-grid" });

  // 今日学习卡片
  const todayPct = quota ? Math.min(100, (today / quota) * 100) : 100;
  const startLabel = completed
    ? "词库学完 🎉 去看看"
    : today > 0
      ? ["继续学习", kbd("Enter")]
      : ["开始学习", kbd("Enter")];
  const todayCard = el("div", { class: "card" }, [
    el("div", { class: "card-title" }, ["📖 今日学习"]),
    el("div", { class: "card-sub" }, [
      `今天已完成 ${today} 个（每日 ${quota} 个）${completed ? "· 全部学完！" : ""}`
    ]),
    el("div", { class: "progress-track" }, [
      el("div", { class: "progress-fill", style: `width:${todayPct}%` })
    ]),
    el("div", { class: "home-actions" }, [
      el(
        "button",
        {
          class: "btn btn-primary btn-lg btn-block",
          onclick: () => {
            sfx.click();
            navigate("/learn");
          }
        },
        startLabel
      )
    ])
  ]);
  grid.append(todayCard);

  // 复习卡片
  const reviewCard = el("div", { class: "card" }, [
    el("div", { class: "card-title" }, [
      "🔁 复习",
      el("span", { class: wrongCount > 0 ? "badge badge-warn" : "badge badge-primary" }, [
        `错词 ${wrongCount}`
      ])
    ]),
    el("div", { class: "card-sub" }, ["随机抽 20 个已学词，支持中译英 / 英译中"]),
    el(
      "button",
      {
        class: "btn btn-soft btn-block",
        onclick: () => {
          sfx.click();
          navigate("/review");
        }
      },
      ["开始复习"]
    )
  ]);
  grid.append(reviewCard);

  // 语法入口卡片
  const grammarCard = el("div", { class: "card" }, [
    el("div", { class: "card-title" }, ["📚 语法学习"]),
    el("div", { class: "card-sub" }, [
      grammarUnlocked
        ? "已解锁，从句子到文章，逐步进阶"
        : `累计掌握 ${state.settings.grammarUnlockAt} 词后解锁（还差 ${Math.max(0, state.settings.grammarUnlockAt - learned)} 个）`
    ]),
    el(
      "button",
      {
        class: "btn btn-ghost btn-block",
        onclick: () => {
          sfx.click();
          navigate("/grammar");
        }
      },
      [grammarUnlocked ? "进入语法" : "查看进度"]
    )
  ]);
  grid.append(grammarCard);

  // 无限模式卡片
  const best = state.infiniteBest || {};
  const infiniteCard = el("div", { class: "card" }, [
    el("div", { class: "card-title" }, [
      "⚡ 无限模式",
      best.score > 0
        ? el("span", { class: "badge badge-warn" }, [`最高 ${best.score} 分`])
        : null
    ]),
    el("div", { class: "card-sub" }, ["全词库随机出题，答得越多分数越高，连击翻倍！"]),
    el(
      "button",
      {
        class: "btn btn-success btn-block",
        onclick: () => {
          sfx.click();
          navigate("/infinite");
        }
      },
      ["开始无限挑战"]
    )
  ]);
  grid.append(infiniteCard);

  root.append(grid);

  // 桌面快捷键：Enter 开始学习
  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sfx.click();
      navigate("/learn");
    }
  };
  document.addEventListener("keydown", onKey);
  cleanup.push(() => document.removeEventListener("keydown", onKey));

  return {
    node: root,
    destroy() {
      cleanup.forEach((f) => f());
    }
  };
}
