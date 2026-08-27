/* DailyWords Service Worker — 版本 v2
   策略（SPEC §12）：
   - 代码文件（HTML/JS/CSS/manifest）：网络优先，失败回退缓存 → 开发迭代刷新即生效
   - 数据/图标（words.json、icons/）：缓存优先 → 省流量、离线可用
   版本号升级时自动清理旧缓存。
   ============================================================ */
const CACHE_NAME = "dw-v5";
const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "data/words.json",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-180.png",
  "assets/fonts/Nunito-Bold.ttf",
  "styles/tokens.css",
  "styles/base.css",
  "styles/components.css",
  "styles/views.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(req, res) {
  if (res && res.status === 200 && res.type === "basic") {
    caches.open(CACHE_NAME).then((cache) => cache.put(req, res));
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 词库与图标：缓存优先（体积大、内容稳定）
  const stable = /(data\/words\.json|icons\/)/.test(url.pathname);

  if (stable) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          cachePut(req, res.clone());
          return res;
        });
      })
    );
    return;
  }

  // 代码文件：网络优先（迭代刷新即生效），失败回退缓存（离线可用）
  event.respondWith(
    fetch(req)
      .then((res) => {
        cachePut(req, res.clone());
        return res;
      })
      .catch(() => caches.match(req))
  );
});
