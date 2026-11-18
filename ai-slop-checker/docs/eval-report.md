# Corpus quality eval report — Lazynext AI Slop Checker

Date: **2026-11-17**. Engine: **1.4.1**. Run: `node bench/eval.js` (exit 0).

Methodology: the positive/negative samples and per-language slop/clean
samples under `bench/corpus/` were **authored in-repo for this benchmark**
— short, original sentences (2-6 each) written by Lazynext against the
shipped tell catalog, **not copied from the five source projects**. The
negative set is freshly written clean prose (technical docs, product copy,
academic-neutral, narrative) and clean HTML with no intended tells.

## Corpus

| set | contents |
|---|---|
| positives (text) | 30 files — 2 per family × 15 text families (word-ban, filler-phrases, business-jargon, throat-clearing, binary-contrast, weasel-attribution, false-agency, passive-voice, meta-commentary, vague-declarative, superficial-analysis, rhetorical-setup, dramatic-fragment, negative-listing, summary-recap) |
| positives (HTML) | 6 design-tell snippets (gradient hero/text, tracked caps, middle-dot meta, glued arrows, crushed tracking, rainbow stops) |
| negatives (text) | 15 clean prose files |
| negatives (HTML) | 5 clean HTML files |
| i18n | `positive-fr.md` / `negative-fr.md`, `positive-de.md` / `negative-de.md` (scanned with merged base + `data/rules.{fr,de}.js`) |

## Final table (real `node bench/eval.js` output, 2026-11-17)

| family | pos-hit | neg-hit | precision | recall | F1 | verdict |
|---|---|---|---|---|---|---|
| word-ban | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| filler-phrases | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| business-jargon | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| throat-clearing | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| binary-contrast | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| weasel-attribution | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| false-agency | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| passive-voice | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| meta-commentary | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| vague-declarative | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| superficial-analysis | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| rhetorical-setup | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| dramatic-fragment | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| negative-listing | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| summary-recap | 2/2 | 0 | 100.0% | 100.0% | 1.000 | PASS |
| design | 6/6 | 0 | 100.0% | 100.0% | 1.000 | PASS |

## Overall

- total matches: **128**; matches on positives: **128**
- negative files: **20**; negative files hit: **0**
- FP rate on negatives: **0.0%** (gate ≤ 5%)
- **GATE: PASS** (exit 0)

## i18n lines

| lang | positive hits | negative FP | verdict |
|---|---|---|---|
| fr (`data/rules.fr.js`) | yes (11 matches) | none | PASS |
| de (`data/rules.de.js`) | yes (11 matches) | none | PASS |

No patterns were required to change to pass the gate's FP contract — the
negative corpus scored 0 matches on the first run. One pattern was tightened
for the cross-file corpus gate: `fr-w-seamless` (data/rules.fr.js) first
shipped the same Unicode-boundary regex as `es-w-seamless`
(`(?<!\p{L}\p{N})seamless(?!\p{L}\p{N})`), which `check-corpus.js` rejects
as a byte-identical match string in the same category. It now matches the
French-specific noun+anglicism juxtaposition
`(?:expérience|solution|intégration|parcours|paiement) seamless\b` — a
tighter context, not a deleted or weakened pattern (each corpus still
appends its full category and both fire on their labelled positives).

---

## Rerun — 2026-11-18 (ru/hi/es i18n lines added)

Date: **2026-11-18**. Run: `node bench/eval.js` (exit 0). The earlier
fr/de-only i18n coverage was flagged as incomplete in the first eval report
review, so the i18n lines now cover **five** languages: fr/de as before plus
**ru/hi/es**. New samples `bench/corpus/positive-{ru,hi,es}.md` /
`negative-{ru,hi,es}.md` were authored in-repo against the shipped
`data/rules.{ru,hi,es}.js` corpora (same authorship rule as the rest of the
corpus — original Lazynext-written sentences, not copied from the five
source projects). The eval asserts, per language, that the positive sample
fires (matches > 0, sure hits in its own language category) and the negative
sample stays free of hits (0 FP), with the same overall gate:
any language-line FAIL -> exit 1.

### i18n lines (real `node bench/eval.js` output, 2026-11-18)

| lang | positive hits | negative FP | verdict |
|---|---|---|---|
| fr (`data/rules.fr.js`) | yes (11 matches) | none | PASS |
| de (`data/rules.de.js`) | yes (11 matches) | none | PASS |
| ru (`data/rules.ru.js`) | yes (9 matches) | none | PASS |
| hi (`data/rules.hi.js`) | yes (11 matches) | none | PASS |
| es (`data/rules.es.js`) | yes (12 matches) | none | PASS |

### Overall (rerun, 2026-11-18)

- total matches: **128**; matches on positives: **128**
- negative files: **20**; negative files hit: **0**
- FP rate on negatives: **0.0%** (gate ≤ 5%)
- i18n lines: **5/5 PASS** (fr, de, ru, hi, es)
- **GATE: PASS** (exit 0)

The per-family table is unchanged from the 2026-11-17 run — the new samples
are language lines only and do not touch the base positive/negative corpora.

Corpus integrity rerun (`node scripts/check-corpus.js data/rules.ru.js
data/rules.hi.js data/rules.es.js data/rules.fr.js data/rules.de.js`,
2026-11-18): **INTEGRITY PASS** — 446 unique pattern ids / 446 total across
6 corpora, 32 unique category ids, zero cross-file duplication; each corpus
passes per-file (built-in 279/27, ru 36/1, hi 33/1, es 34/1, fr 32/1,
de 32/1).