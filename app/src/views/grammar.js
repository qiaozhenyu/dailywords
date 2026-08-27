/* ============================================================
   views/grammar.js — 语法教学（占位 + 解锁门槛，规格 §9.4）
   解锁条件：累计掌握 grammarUnlockAt 词（默认 500），内容二期填充
   ============================================================ */
import { el, toast } from "../ui.js";
import { state, learnedCount } from "../state.js";
import { sfx } from "../sfx.js";

const COURSES = [
  { icon: "①", title: "简单句入门", desc: "主谓宾、be 动词、一般现在时" },
  { icon: "②", title: "复合句进阶", desc: "从句、连接词、时态综合" },
  { icon: "③", title: "段落阅读", desc: "段落的衔接与理解" },
  { icon: "④", title: "文章精读", desc: "整篇英文文章精读训练" }
];

export function renderGrammar() {
  const learned = learnedCount();
  const need = state.settings.grammarUnlockAt;
  const unlocked = learned >= need;
  const root = el("div", {});

  root.append(el("h2", { class: "page-title" }, "📚 语法学习"));

  if (!unlocked) {
    root.append(
      el("div", { class: "card grammar-lock" }, [
        el("div", { class: "lock-icon" }, "🔒"),
        el("div", { class: "card-title", style: "justify-content:center" }, "尚未解锁"),
        el("div", { class: "card-sub" }, [
          `累计掌握 ${need} 个单词后解锁语法学习，从句子到文章逐步进阶。`
        ]),
        el("div", { class: "progress-track grammar-unlock-bar" }, [
          el("div", {
            class: "progress-fill",
            style: `width:${Math.min(100, (learned / need) * 100)}%`
          })
        ]),
        el("div", { class: "card-sub" }, [
          `已掌握 ${learned} / ${need} 词，还差 ${Math.max(0, need - learned)} 个`
        ])
      ])
    );
    return root;
  }

  // 已解锁：课程列表占位
  root.append(el("div", { class: "card-sub" }, "已解锁 🎉 课程内容开发中，敬请期待。"));
  for (const c of COURSES) {
    root.append(
      el("div", { class: "card grammar-course", onclick: () => { sfx.click(); toast("课程内容开发中，二期上线"); } }, [
        el("div", { class: "card-title" }, [
          el("span", {}, `${c.icon} ${c.title}`),
          el("span", { class: "badge badge-primary" }, "占位")
        ]),
        el("div", { class: "card-sub" }, c.desc)
      ])
    );
  }
  return root;
}
