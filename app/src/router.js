/* ============================================================
   router.js — 手写 hash 路由（ADR-2）
   路由表：/ 今日、/learn 学习、/review 复习、/grammar 语法、
           /progress 进度、/settings 设置
   页面可声明 hideTabbar: true 隐藏底部 Tab 栏（会话视图）。
   ============================================================ */
const routes = new Map();
let rootEl = null;
let onRouteChange = null; // 用于刷新 Tab 高亮
let currentCleanup = null; // 当前视图的 destroy 钩子

export function register(path, renderer, opts = {}) {
  routes.set(path, { render: renderer, ...opts });
}

export function navigate(path) {
  if (location.hash === "#" + path) {
    render();
  } else {
    location.hash = path;
  }
}

export function currentPath() {
  return (location.hash || "#/").replace(/^#/, "") || "/";
}

export function initRouter(root, onRouteChangeCb) {
  rootEl = root;
  onRouteChange = onRouteChangeCb || null;
  window.addEventListener("hashchange", render);
  render();
}

function render() {
  if (!rootEl) return;
  // 卸载上一视图（清理键盘监听/定时器）
  if (typeof currentCleanup === "function") {
    try {
      currentCleanup();
    } catch (e) {
      console.warn("视图清理失败:", e);
    }
    currentCleanup = null;
  }
  const path = currentPath();
  const route = routes.get(path) || routes.get("/");
  rootEl.innerHTML = "";
  if (!route) return;
  const page = route.render();
  if (page && page.node instanceof Node) {
    rootEl.append(page.node);
    if (typeof page.destroy === "function") currentCleanup = page.destroy;
  } else if (page instanceof Node) {
    rootEl.append(page);
  }
  if (onRouteChange) onRouteChange(path, !!route.hideTabbar);
}

export function reRender() {
  render();
}
