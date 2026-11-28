#!/usr/bin/env node
/**
 * Campaign copy check — `node scripts/copy_check_sequence.mjs`.
 *
 * The production lead-nurture sequence (SEQUENCE in worker/src/services.ts) is
 * live mail: every new lead receives it. It must never trip the copy gate, and
 * until this script existed nothing checked that after the fact — a rule added
 * to the gate could silently start blocking the funnel, or (worse) the copy
 * could be edited into an unsupported conformance claim and ship.
 *
 * This reads the real SEQUENCE constant out of the TypeScript source, strips
 * the template interpolations, runs both runtimes' rule tables over the copy,
 * and fails if anything BLOCKS. Warnings are printed but never fail: a style
 * tell is not a legal risk.
 *
 * Exit codes: 0 clean, 1 a blocking finding (or a runtime disagreed), 2 the
 * check could not run.
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** Pull the three subject/body pairs out of the SEQUENCE array literal. */
function extractSequence(source) {
  const start = source.indexOf("export const SEQUENCE = [");
  if (start === -1) throw new Error("SEQUENCE constant not found in worker/src/services.ts");
  const open = source.indexOf("[", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "[") depth += 1;
    else if (source[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error("unterminated SEQUENCE array literal");
  const literal = source.slice(open, end);

  const emails = [];
  const subjectRe = /subject:\s*"((?:[^"\\]|\\.)*)"/g;
  const htmlRe = /html:\s*`((?:[^`\\]|\\.)*)`/g;
  let s;
  while ((s = subjectRe.exec(literal)) !== null) emails.push({ subject: s[1] });
  let h;
  let i = 0;
  while ((h = htmlRe.exec(literal)) !== null) {
    if (emails[i]) emails[i].html = h[1];
    i += 1;
  }
  return emails;
}

/** Strip template expressions and tags so we lint the words, not the markup. */
function plain(text) {
  return text
    .replace(/\$\{[^}]*\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function main() {
  const servicesPath = join(ROOT, "worker", "src", "services.ts");
  let emails;
  try {
    emails = extractSequence(readFileSync(servicesPath, "utf8"));
  } catch (err) {
    console.error(`copy check: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  if (emails.length === 0) {
    console.error("copy check: parsed zero emails from SEQUENCE — the parser needs updating");
    return 2;
  }

  // Run the TypeScript rule table through the compiled worker test harness.
  // The gate is a pure function, so a tiny inline tsx-free transpile is not
  // available; instead we shell out to the worker's own test runner fixture,
  // which already imports the shipped module.
  const payload = emails.map((e) => `${e.subject}\n${plain(e.html ?? "")}`);

  let out;
  try {
    out = execFileSync(
      process.execPath,
      [join(ROOT, "worker", "scripts", "copy-check-cli.mjs"), JSON.stringify(payload)],
      { cwd: ROOT, encoding: "utf8" },
    );
  } catch (err) {
    console.error("copy check: could not run the worker copy gate");
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  const results = JSON.parse(out);
  let blocked = 0;
  results.forEach((r, idx) => {
    const label = `email ${idx + 1}`;
    if (r.blocks.length) {
      blocked += 1;
      console.log(`${label}: BLOCKED by ${[...new Set(r.blocks.map((b) => b.rule_id))].join(", ")}`);
    } else if (r.warnings.length) {
      const ids = [...new Set(r.warnings.map((w) => w.rule_id))];
      console.log(`${label}: ok (${ids.length} warn: ${ids.join(", ")})`);
    } else {
      console.log(`${label}: ok`);
    }
  });

  if (blocked) {
    console.log(`\nCOPY CHECK: FAIL — ${blocked} of ${results.length} production emails would be blocked.`);
    return 1;
  }
  console.log(`\nCOPY CHECK: PASS — ${results.length} production emails carry no blocking finding.`);
  return 0;
}

process.exit(main());
