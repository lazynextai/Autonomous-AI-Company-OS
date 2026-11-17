"use strict";
/**
 * Lazynext AI Slop Checker — service worker (web/sw.js).
 *
 * Offline shell for the in-browser checker. All paths are SCOPE-RELATIVE
 * (built from `self.registration.scope`) so the checker works from any
 * mount path — a repo page, a subfolder static host, or the API server's
 * web root — not just from the origin root.
 *
 * Strategy:
 *   - Page (index.html + navigations): NETWORK-FIRST — always try the live
 *     page so users get fresh copy; fall back to the cached shell offline.
 *   - Versioned assets (engine modules, app script, styles, manifest,
 *     icons): CACHE-FIRST — the engine never changes URL, so a stale copy
 *     is still consistent and the whole checker keeps working offline.
 *
 * The cache is versioned (CACHE_NAME) so a new release naturally orphans
 * the old cache, which we sweep in `activate`.
 *
 * CSP note: the checker page's CSP stays intact; this worker only reads
 * requests via the fetch event and never injects scripts.
 */

const CACHE_NAME = "lazynext-slop-checker-v1";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Versioned engine modules (UMD, no cache-busting query strings — the file
// content changes with the product, so they ride the same versioned cache).
const ENGINE_ASSETS = [
  "../data/slop-patterns.js",
  "../data/profiles.js",
  "../src/scanner.js",
  "../src/rewriter.js",
  "../src/render-checks.js",
  "../src/project-scanner-browser.js",
];

const ALL_ASSETS = [...SHELL_ASSETS, ...ENGINE_ASSETS];

function scopeUrl(relative) {
  // Keep scope-relative URLs resolvable from the SW's own scope, whether the
  // app is served at /, /checker/, or /foo/bar/.
  try {
    return new URL(relative, self.registration.scope).href;
  } catch {
    return relative;
  }
}

const SHELL_URLS = SHELL_ASSETS.map(scopeUrl);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          ALL_ASSETS.map((rel) => cache.add(scopeUrl(rel)).catch(() => null))
        )
      )
      .then(() => self.skipWaiting())
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache cross-origin requests (scans hit the target server directly).
  if (url.origin !== self.registration.scope.origin) return;

  const isPage = req.mode === "navigate" || (req.destination === "document" && SHELL_URLS.includes(url.href));

  if (isPage) {
    // Network-first for the page: always try fresh, fall back offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(url.href, copy));
          return res;
        })
        .catch(() => caches.match(url.href).then((hit) => hit || caches.match(scopeUrl("./index.html"))))
    );
    return;
  }

  // Cache-first for everything else (assets).
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && url.origin === self.registration.scope.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(url.href, copy));
        }
        return res;
      });
    })
  );
});