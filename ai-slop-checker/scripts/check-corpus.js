"use strict";
/**
 * Lazynext AI Slop Checker — corpus quality gate.
 *
 * Validates one or more pattern corpora for structural integrity:
 *
 *   node scripts/check-corpus.js                      # built-in corpus only
 *   node scripts/check-corpus.js data/rules.ru.js ... # base + extra corpora
 *                                                     # (checked individually
 *                                                     #  AND cross-file)
 *
 * Checks, per corpus:
 *   - pattern ids unique, lowercase, start with a letter, then [a-z0-9-]*
 *   - every pattern has: id, category, severity (1|2|3), match (non-empty),
 *     fix (the "suggestion" — non-empty string)
 *   - kind is one of word|phrase|regex
 *   - category ids unique and each category has a non-empty name/desc
 *   - no duplicate identical match strings within a category
 *   - per-category counts are printed
 *
 * Cross-file (when extra corpora are passed): pattern ids must be unique
 * across ALL files together (the merge path used by the i18n corpora and
 * loadRules rejects duplicates at merge time — this gate catches them
 * before they ever merge).
 *
 * Exit code: 0 on integrity PASS, 1 on any failure (machine-checkable).
 */

const path = require("node:path");

const ID_RE = /^[a-z][a-z0-9-]*$/;
const VALID_KINDS = new Set(["word", "phrase", "regex"]);
const VALID_SEVERITIES = new Set([1, 2, 3]);

function loadCorpus(fileOrModule) {
  // A module object (require()ed by a caller) or a path to a corpus module.
  const mod =
    typeof fileOrModule === "string"
      ? require(path.resolve(fileOrModule))
      : fileOrModule;
  if (!mod || !Array.isArray(mod.patterns)) {
    throw new Error(`not a corpus module (no exports.patterns array): ${fileOrModule}`);
  }
  return mod;
}

/** Validate one corpus against a category universe; returns { count, categories, errors }. */
function validateCorpus(corpus, label, categoryUniverse) {
  const errors = [];
  const where = label ? ` [${label}]` : "";

  const patterns = corpus.patterns || [];
  const categories = corpus.categories || [];

  // --- categories ---
  const categoryIds = new Set();
  for (const c of categories) {
    if (!c || typeof c.id !== "string" || !c.id) {
      errors.push(`category missing id${where}`);
      continue;
    }
    if (categoryIds.has(c.id)) errors.push(`duplicate category id "${c.id}"${where}`);
    categoryIds.add(c.id);
    if (typeof c.name !== "string" || !c.name.trim()) {
      errors.push(`category "${c.id}" missing a name${where}`);
    }
    if (typeof c.desc !== "string" || !c.desc.trim()) {
      errors.push(`category "${c.id}" missing a desc${where}`);
    }
  }
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // --- patterns ---
  const seenIds = new Set();
  const matchInCategory = new Map(); // `${category}\u0000${match}` -> id
  const categoryCounts = new Map(); // category id -> number of patterns

  for (const p of patterns) {
    const at = ` (pattern ${p && p.id ? p.id : "?"})${where}`;
    if (!p || typeof p !== "object") {
      errors.push(`pattern must be an object${at}`);
      continue;
    }
    if (typeof p.id !== "string" || !p.id) {
      errors.push(`pattern missing id${at}`);
    } else if (!ID_RE.test(p.id)) {
      errors.push(`pattern id "${p.id}" fails ^[a-z][a-z0-9-]*$${at}`);
    }
    if (typeof p.id === "string" && p.id) {
      if (seenIds.has(p.id)) errors.push(`duplicate pattern id "${p.id}"${where}`);
      seenIds.add(p.id);
    }
    if (typeof p.category !== "string" || !p.category) {
      errors.push(`pattern missing category${at}`);
    } else if (!categoryUniverse.has(p.category)) {
      // Extension corpora (i18n files) reuse BUILT-IN category ids without
      // redeclaring them — they merge into the base, so a reference is only
      // an error when it resolves outside the merged universe.
      errors.push(
        `pattern "${p.id}" references unknown category "${p.category}"${where} (not in any loaded corpus)`
      );
    } else {
      categoryCounts.set(p.category, (categoryCounts.get(p.category) || 0) + 1);
      if (typeof p.match === "string" && p.match.length > 0) {
        const key = `${p.category}\u0000${p.match}`;
        if (matchInCategory.has(key)) {
          errors.push(
            `duplicate match string in category "${p.category}": "${p.match}" (${matchInCategory.get(key)} and ${p.id})${where}`
          );
        } else {
          matchInCategory.set(key, p.id);
        }
      }
    }
    if (!VALID_SEVERITIES.has(p.severity)) {
      errors.push(`pattern "${p.id || "?"}" severity must be 1|2|3, got ${p.severity}${where}`);
    }
    if (typeof p.match !== "string" || !p.match) {
      errors.push(`pattern "${p.id || "?"}" missing non-empty match text${where}`);
    }
    if (typeof p.fix !== "string" || !p.fix) {
      errors.push(`pattern "${p.id || "?"}" missing suggestion (fix)${where}`);
    }
    if (p.kind !== undefined && !VALID_KINDS.has(p.kind)) {
      errors.push(`pattern "${p.id || "?"}" kind must be word|phrase|regex, got ${p.kind}${where}`);
    }
  }

  return {
    count: patterns.length,
    categoryCount: categories.length,
    categories: [...categoryCounts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    errors,
  };
}

function main(argv) {
  const extraFiles = argv.slice(2).filter((a) => !a.startsWith("--"));
  const files = ["<built-in data/slop-patterns.js>", ...extraFiles];
  const corpora = [require("../data/slop-patterns.js")];
  for (const f of extraFiles) {
    try {
      corpora.push(loadCorpus(f));
    } catch (err) {
      console.error(`FATAL: cannot load ${f}: ${err.message}`);
      process.exit(1);
    }
  }

  // The merged category universe: every category declared by ANY loaded
  // corpus. Extension corpora (i18n files) reuse built-in category ids
  // without redeclaring them, so category references resolve against this
  // union — the same universe loadRules produces when merging them.
  const mergedCategorySet = new Set();
  for (const c of corpora) {
    for (const cat of c.categories || []) {
      if (cat && typeof cat.id === "string") mergedCategorySet.add(cat.id);
    }
  }

  let ok = true;
  let totalPatterns = 0;
  const allIds = new Set();
  let crossDup = 0;
  const crossMatchInCategory = new Map(); // `${category}\u0000${match}` -> id
  const allCategoryIds = new Set();

  for (let i = 0; i < corpora.length; i++) {
    const label = files[i];
    const result = validateCorpus(corpora[i], label, mergedCategorySet);
    totalPatterns += result.count;
    console.log(`\n=== ${label} ===`);
    console.log(`patterns: ${result.count}  categories: ${result.categoryCount}`);
    if (result.categories.length) {
      const rows = result.categories.map((c) => `${c.id}=${c.count}`);
      console.log(`per-category: ${rows.join("  ")}`);
    }
    for (const id of corpora[i].patterns.map((p) => p.id)) {
      if (allIds.has(id)) crossDup++;
      allIds.add(id);
    }
    for (const cat of corpora[i].categories || []) {
      if (cat && typeof cat.id === "string") {
        if (allCategoryIds.has(cat.id)) ok = false;
        allCategoryIds.add(cat.id);
      }
    }
    for (const p of corpora[i].patterns || []) {
      if (typeof p.match !== "string" || !p.match || p.category === undefined) continue;
      const key = `${p.category}\u0000${p.match}`;
      const prev = crossMatchInCategory.get(key);
      if (prev !== undefined && prev !== p.id) {
        ok = false;
        console.error(
          `  FAIL cross-file duplicate match string in category "${p.category}": "${p.match}" (${prev} and ${p.id})`
        );
      } else {
        crossMatchInCategory.set(key, p.id);
      }
    }
    if (result.errors.length) {
      ok = false;
      for (const e of result.errors) console.error(`  FAIL ${e}`);
    } else {
      console.log(`  integrity: PASS (${result.count} patterns, ${result.categoryCount} categories)`);
    }
  }

  if (corpora.length > 1) {
    console.log(`\n=== cross-file uniqueness (${corpora.length} corpora) ===`);
    console.log(`combined pattern ids: ${allIds.size} unique / ${totalPatterns} total`);
    if (crossDup > 0) {
      ok = false;
      console.error(`  FAIL ${crossDup} duplicated pattern id(s) across corpora`);
    } else {
      console.log(`  pattern ids: PASS (zero duplication across corpora)`);
    }
    console.log(`combined category ids: ${allCategoryIds.size} unique / ${mergedCategorySet.size} total`);
    if (allCategoryIds.size !== mergedCategorySet.size) {
      ok = false;
      console.error(`  FAIL duplicated category id(s) across corpora`);
    } else {
      console.log(`  category ids: PASS (zero duplication across corpora)`);
    }
  }

  console.log(`\nRESULT: ${ok ? "INTEGRITY PASS" : "INTEGRITY FAIL"}`);
  return ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { validateCorpus, main, ID_RE };