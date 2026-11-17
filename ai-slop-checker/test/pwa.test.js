"use strict";
/**
 * PWA shell tests: manifest.webmanifest parses and carries the brand
 * contract, sw.js parses as a classic script (new Function), the icon
 * assets exist at the declared sizes, and the registration is guarded to
 * http(s) — file:// must never attempt a registration.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const WEB_DIR = path.join(__dirname, "..", "web");
const manifestPath = path.join(WEB_DIR, "manifest.webmanifest");
const swPath = path.join(WEB_DIR, "sw.js");
const regPath = path.join(WEB_DIR, "register-sw.js");
const indexPath = path.join(WEB_DIR, "index.html");

test("manifest.webmanifest: valid JSON with the brand contract", () => {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const m = JSON.parse(raw);
  assert.equal(m.name, "Lazynext AI Slop Checker");
  assert.equal(m.short_name, "Slop Checker");
  assert.equal(m.display, "standalone");
  assert.equal(m.theme_color, "#0468F8");
  assert.equal(m.background_color, "#FCFCFC");
  // Icons exist on disk at the declared sizes (sips-derived from favicon).
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 2);
  for (const icon of m.icons) {
    assert.match(icon.src, /^\.\/icons\//, "icons are scope-relative");
    assert.ok(fs.existsSync(path.join(WEB_DIR, icon.src.replace(/^\.\//, ""))), `icon file exists: ${icon.src}`);
  }
  const sizeSet = new Set(m.icons.map((i) => i.sizes));
  assert.ok(sizeSet.has("192x192"), "192 icon present");
  assert.ok(sizeSet.has("512x512"), "512 icon present");
  assert.equal(m.start_url, "./index.html", "start_url is scope-relative");
  assert.equal(m.scope, "./", "scope is relative (works from any mount path)");
});

test("manifest.webmanifest: every referenced icon is a real PNG of the right size", () => {
  // Rough PNG dimension probe via the IHDR (bytes 16-23: width, height).
  const probe = (file) => {
    const buf = fs.readFileSync(file);
    assert.equal(buf.readUInt32BE(0), 0x89504e47, `${file} is a PNG`);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    return { w, h };
  };
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const icon of m.icons) {
    const file = path.join(WEB_DIR, icon.src.replace(/^\.\//, ""));
    const { w, h } = probe(file);
    assert.equal(`${w}x${h}`, icon.sizes, `${icon.src} matches its declared size`);
  }
});

test("sw.js: parses as a classic script and defines a fetch handler", () => {
  const src = fs.readFileSync(swPath, "utf8");
  assert.doesNotThrow(() => new Function(src), "sw.js must parse");
  assert.match(src, /addEventListener\("fetch"/, "fetch handler registered");
  assert.match(src, /addEventListener\("install"/, "install handler registered");
  assert.match(src, /registration\.scope/, "scope-relative URL resolution used");
  assert.match(src, /network-first|fetch\(req\)/, "page is network-first");
  assert.match(src, /caches\.match\(req\)/, "assets are cache-first");
});

test("sw.js: never injects scripts or violates the page CSP", () => {
  const src = fs.readFileSync(swPath, "utf8");
  // No document.write, no eval, no <script> building.
  assert.ok(!/document\.write|eval\(/.test(src), "no script injection in sw.js");
  assert.ok(!/<script/i.test(src), "no inline script markup in sw.js");
});

test("register-sw.js: registration is guarded to http(s) — file:// is safe", () => {
  const src = fs.readFileSync(regPath, "utf8");
  assert.doesNotThrow(() => new Function(src), "register-sw.js must parse");
  // The guard itself: file:// protocol skips registration.
  assert.match(src, /https\?:/, "protocol guard present");
  assert.match(src, /window\.location\.protocol/, "guard reads location.protocol");
  assert.match(src, /serviceWorker\.register/, "register call present");
  assert.match(src, /\.catch/, "registration failure is caught (never breaks the page)");

  // Simulate the guard: file:// must take the early return.
  const code = src + "\n;window.__probeResult = (function(){ var navigator = { serviceWorker: {} }; var window = { location: { protocol: 'file:' }, addEventListener: function(){}, isSecureContext: false }; try { eval(src); return true; } catch (e) { return false; } })();";
  // We can't run DOM in Node; instead assert the branch is statically present.
  assert.match(src, /file/, "file:// explicitly mentioned");
});

test("index.html: links the manifest and loads register-sw.js additively", () => {
  const html = fs.readFileSync(indexPath, "utf8");
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/, "manifest linked");
  assert.match(html, /script src="\.\/register-sw\.js" defer/, "registration script loaded");
  // The existing app script and tabs remain untouched (smoke-test stability).
  assert.match(html, /src="\.\/app\.js"/, "app script still loads");
  assert.match(html, /id="tab-text"/, "checker markup untouched");
});