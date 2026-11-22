import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Lifts the shipped isPublicHttpUrl source out of src/urlguard.ts so it can't
// drift from what's deployed — same pattern as artifact-guard.test.mjs. The
// guard was extracted from sign.ts's private isSafeDocUrl (PR #126) into the
// shared module so /render, /pdf, /scrape, /browse and sign doc_url classify
// hosts identically. The module-level helpers (publicIpv4/publicIpv6) are
// lifted too — the whole file is executed, helpers included.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, "../src/urlguard.ts"), "utf8");
assert.ok(src.includes("export function isPublicHttpUrl("), "isPublicHttpUrl must exist in src/urlguard.ts");
assert.ok(src.includes("function publicIpv4(") && src.includes("function publicIpv6("), "module helpers must exist");

// Strip the TS type annotations so the lifted source runs as plain JS.
let js = src
  .replace("export function isPublicHttpUrl(raw: string): boolean {", "function isPublicHttpUrl(raw) {")
  .replace("  let u: URL;", "  let u;")
  .replace("function publicIpv4(octs: number[]): boolean {", "function publicIpv4(octs) {")
  .replace("function publicIpv6(addr: string): boolean {", "function publicIpv6(addr) {")
  .replace("(side: string): number[] | null", "(side)")
  .replace("const out: number[] = [];", "const out = [];")
  .replace("(n: number)", "(n)")
  .replace("(hi: number, lo: number)", "(hi, lo)");

// eslint-disable-next-line no-new-func
const isPublicHttpUrl = new Function("URL", `${js}; return isPublicHttpUrl;`)(URL);

// Drift guard: sign.ts must consume the shared guard, never a private copy.
// PR #126 shipped a private isSafeDocUrl inside sign.ts; #127 extracted it to
// urlguard.ts. A new private copy would let the two doors diverge again.
const signSrc = readFileSync(path.join(__dirname, "../src/sign.ts"), "utf8");
test("sign.ts imports the shared guard and defines no private copy", () => {
  assert.ok(
    /import\s*\{[^}]*isPublicHttpUrl\s+as\s+isSafeDocUrl[^}]*\}\s*from\s*"\.\/urlguard"/.test(signSrc),
    "sign.ts must import isPublicHttpUrl as isSafeDocUrl from ./urlguard",
  );
  assert.ok(
    !/^function isSafeDocUrl\(/m.test(signSrc),
    "sign.ts must not re-define a private isSafeDocUrl",
  );
});

test("SSRF guard accepts public https/http URLs", () => {
  for (const url of [
    "https://example.com/doc.html",
    "http://example.com/plain.txt",
    "https://sub.domain.co.uk/a?b=c#frag",
    "https://checker.lazynext.com/report.html",
  ]) {
    assert.equal(isPublicHttpUrl(url), true, url);
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
    assert.equal(isPublicHttpUrl(url), false, url);
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
    assert.equal(isPublicHttpUrl(url), false, url);
  }
});

test("SSRF guard blocks literal internal hostnames", () => {
  for (const url of [
    "http://localhost/x",
    "http://metadata.internal/latest/meta-data",
    "http://api.internal/query",
    "http://host.local/doc",
  ]) {
    assert.equal(isPublicHttpUrl(url), false, url);
  }
});

test("SSRF guard blocks IPv6 loopback/link-local", () => {
  for (const url of [
    "http://[::1]/x",
    "http://[fe80::1]/x",
  ]) {
    assert.equal(isPublicHttpUrl(url), false, url);
  }
});

test("SSRF guard blocks IPv4-mapped IPv6 (metadata vector)", () => {
  for (const url of [
    "http://[::ffff:169.254.169.254]/latest/meta-data", // EC2 metadata via v4-mapped
    "http://[::ffff:10.0.0.1]/x",                      // private via v4-mapped
    "http://[::ffff:127.0.0.1]/x",                     // loopback via v4-mapped
  ]) {
    assert.equal(isPublicHttpUrl(url), false, url);
  }
});

test("SSRF guard blocks metadata after WHATWG IPv6 normalization", () => {
  // new URL() rewrites these before the guard sees the hostname. The dotted
  // forms above stay blocked; these are the strings fetch actually classifies.
  for (const url of [
    "http://[::ffff:a9fe:a9fe]/latest/meta-data", // [::ffff:169.254.169.254]
    "http://[::ffff:7f00:1]/",                    // [::ffff:127.0.0.1]
    "http://[::ffff:a00:1]/",                     // [::ffff:10.0.0.1]
    "http://[::a9fe:a9fe]/",                      // [::169.254.169.254] compatible
    "http://[2002:a9fe:a9fe::]/",                 // 6to4 embedding
    "http://[64:ff9b::a9fe:a9fe]/",               // NAT64 embedding
    "http://[fc00::1]/",
    "http://[fd00::1]/",
    "http://[fe90::1]/",                          // fe80::/10, not just fe80::
    "http://[fec0::1]/",
    "http://[ff02::1]/",
    "http://[::]/",
  ]) {
    assert.equal(isPublicHttpUrl(url), false, url);
  }
});

test("SSRF guard still allows public IPv6 and public embeddings", () => {
  for (const url of [
    "http://[2606:4700:4700::1111]/",
    "http://[2001:4860:4860::8888]/",
    "http://[::ffff:8.8.8.8]/",
    "http://[2002:0808:0808::]/",
    "http://[64:ff9b::808:808]/",
  ]) {
    assert.equal(isPublicHttpUrl(url), true, url);
  }
});

test("doc snapshot follows redirects manually and re-checks the Location", () => {
  const snap = signSrc.slice(signSrc.indexOf("async function snapshotDoc"));
  assert.match(snap, /redirect:\s*"manual"/);
  assert.doesNotMatch(snap.slice(0, snap.indexOf("async function notifySigner")), /redirect:\s*"follow"/);
});