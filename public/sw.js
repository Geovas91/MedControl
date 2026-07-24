const CACHE_NAME = "clinicontrol-static-v1";
const OFFLINE_URL = "/offline";
const STATIC_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/clinicontrol-192.png",
  "/icons/clinicontrol-512.png",
  "/icons/clinicontrol-maskable-512.png",
  "/icons/apple-touch-icon.png"
];

const SENSITIVE_PREFIXES = ["/admin", "/api", "/auth", "/dashboard", "/onboarding", "/invite", "/consent/sign"];

function isSensitivePath(pathname) {
  return SENSITIVE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isSafeStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || ["/icon.svg", "/manifest.webmanifest"].includes(url.pathname);
}

function canStore(response) {
  return response.ok && response.type === "basic" && !response.headers.has("set-cookie");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.search || request.headers.has("authorization") || request.headers.has("cookie")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isSensitivePath(url.pathname) || !isSafeStaticAsset(url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (canStore(response)) await cache.put(request, response.clone());
      return response;
    })
  );
});
