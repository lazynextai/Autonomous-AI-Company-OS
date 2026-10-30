import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Lifts the shipped isSafeDocUrl source out of src/sign.ts so it can't drift
// from what's deployed — same pattern as artifact-guard.test.mjs.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, "../src/sign.ts"), "utf8");
const marker = "function isSafeDocUrl(";
const start = src.indexOf(marker);
assert.ok(start >= 0, "isSafeDocUrl must exist in src/sign.ts");
const block = src.slice(start);

// Deterministic anchor: the function body ends with `return true; }`.
const endMarker = "return true;\n}";
const end = block.indexOf(endMarker) + endMarker.length;
assert.ok(end > endMarker.length, "isSafeDocUrl must end with `return true; }`");
const raw = block.slice(0, end);

// Strip the two TS type annotations so the lifted source runs as plain JS.
// Targeted replaces only — a global `:\s*\w+` regex would mangle the
// ternary `? a : b` inside the function body.
let js = raw
  .replace("function isSafeDocUrl(raw: string): boolean {", "function isSafeDocUrl(raw) {")
  .replace("  let u: URL;", "  let u;");

// eslint-disable-next-line no-new-func
const isSafeDocUrl = new Function("URL", `${js}; return isSafeDocUrl;`)(URL);

test("SSRF guard accepts public https/http URLs", () => {
  for (const url of [
    "https://example.com/doc.html",
    "http://example.com/plain.txt",
    "https://sub.domain.co.uk/a?b=c#frag",
    "https://checker.lazynext.com/report.html",
  ]) {
    assert.equal(isSafeDocUrl(url), true, url);
  }
});

test("SSRF guard blocks non-http(s) protocols", () => {
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com/doc",
    "gopher://example.com/x",
    "data:text/html,<x>",
    "javascript:alert(1)",
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});

test("SSRF guard blocks private/loopback/link-local/CGNAT/metadata IPs", () => {
  for (const url of [
    "http://10.0.0.1/x",           // private
    "http://172.16.5.5/x",         // private
    "http://172.31.255.255/x",     // private (upper edge)
    "http://192.168.1.1/x",        // private
    "http://127.0.0.1/x",          // loopback
    "http://169.254.169.254/latest/meta-data", // cloud metadata
    "http://100.64.0.1/x",         // CGNAT
    "http://224.0.0.1/x",          // multicast
    "http://0.0.0.0/x",            // invalid
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});

test("SSRF guard blocks literal internal hostnames", () => {
  for (const url of [
    "http://localhost/x",
    "http://metadata.internal/latest/meta-data",
    "http://api.internal/query",
    "http://host.local/doc",
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});

test("SSRF guard blocks IPv6 loopback/link-local", () => {
  for (const url of [
    "http://[::1]/x",
    "http://[fe80::1]/x",
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});

test("SSRF guard blocks IPv4-mapped IPv6 (metadata vector)", () => {
  for (const url of [
    "http://[::ffff:169.254.169.254]/latest/meta-data", // EC2 metadata via v4-mapped
    "http://[::ffff:10.0.0.1]/x",                      // private via v4-mapped
    "http://[::ffff:127.0.0.1]/x",                     // loopback via v4-mapped
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});