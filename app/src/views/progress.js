/* ============================================================
   views/progress.js — 学习进度（规格 §9.5）
   统计卡片 + 近 7 日柱状图（纯 CSS）+ 词库比例 + 已学单词列表
   ============================================================ */
import { el } from "../ui.js";
import { state, learnedCount, todayLearnedCount, wrongWordIds, isLearned } from "../state.js";
import { speak } from "../tts.js";

export function renderProgress() {
  const root = el("div", {});
  root.append(el("h2", { class: "page-title" }, "📊 学习进度"));

  const learned = learnedCount();
  const total = state.words.length;
  const stats = state.stats;
  const today = todayLearnedCount();
  const wrong = wrongWordIds().length;

  const statItems = [
    { label: "已学词汇", value: `${learned}` },
    { label: "今日已学", value: `${today}` },
    { label: "累计复习", value: `${stats.totalReview || 0}` },
    { label: "错词本", value: `${wrong}` },
    { label: "连续天数", value: `${stats.streak || 0}` },
    { label: "最佳连续", value: `${stats.bestStreak || 0}` }
  ];

  const grid = el("div", { class: "stat-grid" });
  for (const s of statItems) {
    grid.append(
      el("div", { class: "stat-card" }, [
        el("div", { class: "num" }, s.value),
        el("div", { class: "label" }, s.label)
      ])
    );
  }
  root.append(grid);

  // 词库掌握比例
  const pct = total ? Math.round((learned / total) * 100) : 0;
  root.append(
    el("div", { class: "card", style: "margin-top:16px" }, [
      el("div", { class: "card-title" }, ["词库掌握", el("span", { class: "badge badge-primary" }, `${pct}%`)]),
      el("div", { class: "progress-track" }, [
        el("div", { class: "progress-fill", style: `width:${pct}%` })
      ]),
      el("div", { class: "card-sub", style: "margin-top:8px;margin-bottom:0" }, [
        `已学 ${learned} / ${total} 个，坚持每天 10 个，约 ${Math.max(0, Math.ceil((total - learned) / state.settings.dailyQuota))} 天学完`
      ])
    ])
  );

  // 近 7 日柱状图
  root.append(
    el("div", { class: "card", style: "margin-top:16px" }, [
      el("div", { class: "card-title" }, "近 7 日新学"),
      renderBarChart(state.last7)
    ])
  );

  // 已学单词列表（完整释义，可搜索，点击发音）
  root.append(renderLearnedWords());

  return root;
}

function renderBarChart(last7) {
  const chart = el("div", { class: "bar-chart" });
  const max = Math.max(1, ...last7.map((x) => x.newWords));
  const days = last7.length
    ? last7
    : [{ date: new Date().toISOString().slice(0, 10), newWords: 0 }];

  for (const d of days) {
    const h = Math.max(4, (d.newWords / max) * 100);
    const label = d.date.slice(5).replace("-", "/"); // MM/DD
    chart.append(
      el("div", { class: "bar-col" }, [
        el("div", { class: "bar-val" }, `${d.newWords}`),
        el("div", { class: "bar", style: `height:${h}%` }),
        el("div", { class: "bar-label" }, label)
      ])
    );
  }
  return chart;
}

/** 已学单词列表：完整中文释义（与学习卡的第一义项不同），支持搜索与点击发音 */
function renderLearnedWords() {
  const learnedWords = state.words
    .filter((w) => isLearned(w.word))
    .sort((a, b) => (a.word < b.word ? -1 : 1));

  const search = el("input", {
    class: "word-search",
    type: "search",
    placeholder: "搜索已学单词…",
    autocomplete: "off",
    oninput: (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const li of list.children) {
        const hidden = q && !li.dataset.search.includes(q);
        li.style.display = hidden ? "none" : "";
      }
      empty.style.display = learnedWords.length === 0 ? "" : "none";
    }
  });

  const list = el("ul", { class: "word-list" });
  for (const w of learnedWords) {
    list.append(
      el("li", { class: "word-item", dataset: { word: w.word, search: `${w.word} ${w.translation}`.toLowerCase() } }, [
        el("span", { class: "word-item-en" }, w.word),
        w.phonetic ? el("span", { class: "word-item-phonetic" }, w.phonetic) : null,
        el("span", { class: "word-item-zh" }, w.translation)
      ])
    );
  }

  // 点击行发音（事件委托，避免 3500 个监听器）
  list.addEventListener("click", (e) => {
    const li = e.target.closest(".word-item");
    if (li) speak(li.dataset.word);
  });

  const empty = el("div", { class: "empty-state" }, [
    el("div", { class: "emoji" }, "🌱"),
    el("div", {}, "还没有已学单词，去「今日」学几个吧！")
  ]);
  if (learnedWords.length > 0) empty.style.display = "none"; // 有词时隐藏空态

  return el("div", { class: "card", style: "margin-top:16px" }, [
    el("div", { class: "card-title" }, [
      "📚 已学单词",
      el("span", { class: "badge badge-primary" }, `${learnedWords.length} 个`)
    ]),
    search,
    list,
    empty
  ]);
}
