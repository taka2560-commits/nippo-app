// オフライン対応のサービスワーカー
// - 画面（HTML）：まずネットワーク、つながらない／遅いときは前回の保存分を表示
// - /_next/static/ のファイル：内容が変わるとファイル名も変わるので、保存分を優先
// - 入力データは端末内（localStorage）にあるため、画面さえ開ければオフラインでも入力できる
// 画面やファイル構成を大きく変えたときは VERSION を上げる（古い保存分が自動で消える）
const VERSION = "v1";
const STATIC_CACHE = `nippo-static-${VERSION}`;
const PAGE_CACHE = `nippo-pages-${VERSION}`;
const PAGES = ["/", "/history", "/monthly", "/settings"];
const ASSETS = ["/manifest.json", "/icons/icon-192x192.png", "/icons/icon-512x512.png", "/favicon.ico"];
const NETWORK_TIMEOUT_MS = 3000;
// 更新のたびにファイル名が変わるため、保存分が増え続けないよう、これを超えたら作り直す
const MAX_STATIC_ENTRIES = 150;

// 画面のキー（?date= などの違いは無視して、パスだけで保存・検索する）
const pageKey = (url) => new URL(url.pathname, url.origin).href;

// 最初のインストール時に、4つの画面と、それが使うファイルをまとめて保存しておく
// （1回も開いたことのない画面でも、オフラインで開けるようにするため）
async function precache() {
    const pages = await caches.open(PAGE_CACHE);
    const statics = await caches.open(STATIC_CACHE);
    const staticUrls = new Set(ASSETS);

    await Promise.all(
        PAGES.map(async (path) => {
            try {
                const res = await fetch(path, { cache: "reload" });
                if (!res.ok) return;
                await pages.put(new URL(path, self.location.origin).href, res.clone());
                const html = await res.text();
                for (const m of html.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) staticUrls.add(m[0]);
            } catch {
                // 取得できなかった画面は、あとで開いたときに保存される
            }
        })
    );
    await Promise.all(
        [...staticUrls].map(async (u) => {
            try {
                if (!(await statics.match(u))) await statics.add(u);
            } catch {
                // 同上
            }
        })
    );
}

self.addEventListener("install", (event) => {
    event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
            for (const name of await caches.keys()) {
                if (name.startsWith("nippo-") && !keep.has(name)) await caches.delete(name);
            }
            await self.clients.claim();
        })()
    );
});

// つながっている（画面の取得に成功した）ときに、保存分が多すぎれば古いものを捨てて作り直す
async function trimIfNeeded() {
    const statics = await caches.open(STATIC_CACHE);
    if ((await statics.keys()).length <= MAX_STATIC_ENTRIES) return;
    await caches.delete(STATIC_CACHE);
    await precache();
}

const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

async function pageResponse(event) {
    const request = event.request;
    const url = new URL(request.url);
    const cache = await caches.open(PAGE_CACHE);
    const key = pageKey(url);

    const network = fetch(request).then((res) => {
        // リダイレクトやエラー応答は保存しない
        if (res.ok && res.type === "basic") cache.put(key, res.clone());
        return res;
    });
    // 通信が終わる前に処理が止められないようにする（保存分の更新のため）
    event.waitUntil(
        network
            .then(() => trimIfNeeded())
            .catch(() => { })
    );

    const cached = (await cache.match(key)) ?? (await cache.match(new URL("/", url.origin).href));
    if (!cached) return network;
    // つながらない、または遅い（電波が弱い）ときは、保存分をすぐ表示する
    const res = await Promise.race([network.catch(() => null), timeout(NETWORK_TIMEOUT_MS)]);
    return res ?? cached;
}

async function staticResponse(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api/")) return;
    // 画面遷移中のデータ取得（RSC）は触らない。失敗するとアプリ側が通常の画面遷移に切り替える
    if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

    if (request.mode === "navigate") {
        event.respondWith(pageResponse(event));
    } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.json") {
        event.respondWith(staticResponse(request));
    }
});
