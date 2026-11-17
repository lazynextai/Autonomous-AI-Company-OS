"use strict";
/**
 * Package metadata tests (Phase 5 packaging gate).
 *
 *   - package.json metadata: name/version/main/exports/engines/files are valid
 *   - `main` and every `exports` target resolve to an existing file
 *   - the `files` allowlist exists, every entry ships real content, and the
 *     full runtime surface (scanner, corpus, server, web checker) is covered
 *   - the engine can be require()d THROUGH THE PACKAGE NAME from a temp dir
 *     (child_process with cwd=os.tmpdir, node_modules symlink) — this is the
 *     closest offline analogue of an install, exercising the real resolution
 *     path (name -> main/exports) without publishing anything.
 *
 * npm pack --dry-run is deliberately NOT invoked here; run it manually (or in
 * CI) to inspect the tarball contents.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const pkg = require("../package.json");

test("package.json: metadata fields are well-formed", () => {
  assert.equal(typeof pkg.name, "string");
  assert.match(pkg.name, /^@lazynext\/[a-z-]+$/, "scoped name");
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "semver version");
  assert.equal(typeof pkg.main, "string");
  assert.match(pkg.main, /^src\//, "main under src/");
  assert.equal(typeof pkg.license, "string");
  assert.ok(pkg.engines && typeof pkg.engines.node === "string", "engines.node set");
  assert.ok(/\b20\b|\b2[0-9]\b|\b[3-9][0-9]\b/.test(pkg.engines.node), `engines.node >=20 (got ${pkg.engines.node})`);
});

test("package.json: main and every exports target exist on disk", () => {
  assert.ok(fs.existsSync(path.join(ROOT, pkg.main)), `main ${pkg.main} exists`);
  for (const [subpath, target] of Object.entries(pkg.exports || {})) {
    assert.ok(
      fs.existsSync(path.join(ROOT, target)),
      `exports["${subpath}"] target ${target} exists`
    );
  }
});

test("package.json: files allowlist exists, entries exist, runtime surface covered", () => {
  assert.ok(Array.isArray(pkg.files), "files allowlist present");
  assert.ok(pkg.files.length >= 5, "files allowlist has entries");
  for (const entry of pkg.files) {
    assert.ok(fs.existsSync(path.join(ROOT, entry)), `files entry "${entry}" exists`);
  }
  // The runtime surface consumers actually load.
  const runtimeFiles = [
    "src/scanner.js",
    "src/rewriter.js",
    "src/rules-loader.js",
    "src/project-scanner.js",
    "src/render-checks.js",
    "src/collect-render.js",
    "src/judge.js",
    "data/slop-patterns.js",
    "data/profiles.js",
    "data/rules.ru.js",
    "data/rules.hi.js",
    "data/rules.es.js",
    "data/rules.fr.js",
    "data/rules.de.js",
    "api/server.js",
    "api/worker.js",
    "api/agent-surfaces.js",
    "api/openapi.json",
    "web/index.html",
    "web/app.js",
  ];
  for (const wanted of runtimeFiles) {
    const covered = pkg.files.some((entry) => {
      const dir = entry.replace(/\/$/, "");
      return wanted === dir || wanted.startsWith(dir + "/") || wanted.startsWith(entry);
    });
    assert.ok(covered, `files allowlist must ship ${wanted}`);
  }
});

test("package.json: engine require()s through the package name from a temp dir", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slop-pkg-"));
  try {
    // Symlink the package into a throwaway node_modules so `require(name)`
    // resolves main + exports exactly like an install (cwd = os.tmpdir, so
    // nothing in the repo can leak into the resolution).
    const nm = path.join(tmp, "node_modules", "@lazynext");
    fs.mkdirSync(nm, { recursive: true });
    fs.symlinkSync(ROOT, path.join(nm, "ai-slop-checker"), "dir");

    const script = `
      const api = require("@lazynext/ai-slop-checker");
      const names = Object.keys(api);
      const hasSurface = ["scanText", "scanHtml", "scanDesign", "extractText", "createEngine", "countEmoji", "patterns", "categories"].every((k) => k in api);
      const r = api.scanText("We must leverage our robust solution in today's fast-paced world.");
      console.log(JSON.stringify({
        hasSurface,
        engine: r.engine,
        version: r.version,
        score: r.score,
        verdict: r.verdict,
        matches: r.matches.length,
      }));
    `;
    const res = spawnSync(process.execPath, ["-e", script], {
      cwd: tmp,
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(res.status, 0, `require from temp dir failed: ${res.stderr}${res.stdout}`);
    const out = JSON.parse(res.stdout.trim().split("\n").pop());
    assert.equal(out.hasSurface, true);
    assert.equal(typeof out.score, "number");
    assert.ok(out.score >= 0 && out.score <= 100, `score in range: ${out.score}`);
    assert.ok(out.matches > 0, "slop text produces matches");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});