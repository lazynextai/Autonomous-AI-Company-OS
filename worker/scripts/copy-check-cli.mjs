#!/usr/bin/env node
/**
 * Copy-gate bridge — runs the shipped TypeScript copy gate from plain Node.
 *
 * Pipeline scripts cannot import `worker/src/copygate.ts` directly, and adding
 * a TS runner as a runtime dependency to a zero-dep script would be the wrong
 * trade. esbuild already ships with the worker's devDependencies (it is a
 * wrangler dependency), so this transpiles the real module in memory and
 * evaluates it. It always exercises the SHIPPED source — a rule change cannot
 * drift away from what this bridge sees.
 *
 * Usage: node worker/scripts/copy-check-cli.mjs '["text one","text two"]'
 * Prints a JSON array of { blocks, warnings } per input, in order.
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(HERE, "..");
const SRC = join(WORKER, "src", "copygate.ts");

const require = createRequire(join(WORKER, "package.json"));

function loadGate() {
  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch {
    throw new Error(
      "esbuild not found — it ships with wrangler. Run `npm install` in worker/ first.",
    );
  }
  const source = readFileSync(SRC, "utf8");
  const { code } = esbuild.transformSync(source, {
    loader: "ts",
    format: "cjs",
    target: "node20",
  });
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function("module", "exports", "require", code)(module, module.exports, require);
  return module.exports;
}

function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error("copy-check-cli: expected a JSON array of texts as argv[2]");
    return 2;
  }
  let texts;
  try {
    texts = JSON.parse(raw);
  } catch (err) {
    console.error(`copy-check-cli: bad JSON — ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  if (!Array.isArray(texts)) {
    console.error("copy-check-cli: expected a JSON array");
    return 2;
  }

  let gate;
  try {
    gate = loadGate();
  } catch (err) {
    console.error(`copy-check-cli: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  const out = texts.map((text) => {
    const findings = gate.lintCopy(String(text ?? ""));
    return {
      blocks: gate.blockingFindings(findings),
      warnings: gate.warningFindings(findings),
      score: typeof gate.slopScore === "function" ? gate.slopScore(findings) : null,
    };
  });

  process.stdout.write(JSON.stringify(out));
  return 0;
}

process.exit(main());
