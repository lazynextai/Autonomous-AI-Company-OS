# Lazynext AI Slop Checker — usage reference

Complete command-line, API, MCP, and error-code reference for v1.4.4. The
engine is deterministic and zero-dependency: same input always gives the
same score.

---

## CLI (`node api/cli.js`)

### Flag matrix

| Flag | Argument | Default | Purpose |
|---|---|---|---|
| `--help`, `-h` | — | — | Print the usage text and exit 0 |
| `<text>…` | positionals | — | Scan the joined text arguments (plain text) |
| `--file <path>` | path | — | Scan a text file |
| `--url <url>` | http(s) URL | — | Fetch + scan an HTML page (10s timeout, branded UA) |
| `--dir <path>` | directory | — | Project scan (prose/markup/styles/code lenses) |
| `--top <n>` | int | `10` | Project scan: report the top N worst files |
| `--profile <p>` | `default`\|`strict`\|`lenient` | `default` | Severity profile for this scan |
| `--snapshot <file.json>` | path | — | Rendered-tier checks over a computed snapshot (pure, no browser) |
| `--render <url>` | http(s) URL | — | Collect a snapshot (needs optional playwright) then run rendered checks |
| `--judge` | — | — | Run the judgement checklist (5-question review, craft-floor gate, refusal scaffolds, machine PASS/REVIEW/REFUSE verdict). Combines with `--file`, `--url`, `--dir`, or a positional text |
| `--json` | — | — | Print the machine-readable report (JSON) instead of the table |
| `--rewrite <text>` | — | — | Also apply conservative safe rewrites to the text |
| `--rules` | — | — | Dump the corpus shorthand (id/category/severity) and exit 0 |
| `--rules <spec>` | path \| glob \| csv list | — | Deep-merge external rules (`.js`/`.json`) for this scan |

### CLI exit codes

| Code | Meaning |
|---|---|
| `0` | Scan ran; report is `clean` (score ≤ threshold) — or `--help`/`--json`/`--rules` dump. For `--judge`: verdict is **PASS** |
| `1` | Usage/IO error (bad flag value, unreadable file/dir, broken rules file, parse error) |
| `2` | Scan ran; report is **NOT clean** (findings above the threshold). For `--judge`: verdict is **REVIEW** |
| `3` | `--judge` only: verdict is **REFUSE** (a machine-checked craft-floor item failed) |

### Examples

```sh
    node api/cli.js "We must leverage this."
node api/cli.js --file demo/slop.txt --json
node api/cli.js --profile strict "delve deep into this"
node api/cli.js --rules data/rules.ru.js "В современном мире..."
node api/cli.js --rules data/rules.hi.js "आज के डिजिटल युग में..."   # Hindi i18n corpus
node api/cli.js --rules data/rules.es.js "En el mundo actual..."   # Spanish i18n corpus
node api/cli.js --rules data/rules.fr.js "Dans le monde d'aujourd'hui..."   # French i18n corpus
node api/cli.js --rules data/rules.de.js "In der heutigen schnelllebigen Welt..."   # German i18n corpus
node api/cli.js --rules "rules/**/*.js" --dir src
node api/cli.js --dir path/to/project --top 20 --json
node api/cli.js --snapshot snapshot.json
node api/cli.js --render https://example.com --profile lenient
node api/cli.js --judge --file demo/slop.txt     # judgement checklist
node api/cli.js --judge --url https://example.com
node api/cli.js --judge --dir src
node api/cli.js --judge "We must leverage this." # plain-text judge
```

The `--judge` report is deterministic and machine-built: the 5-question
review (purpose / audience / decision / variety / defaults) ships *hints*
+ *verdictHint* per question plus machine-flagged signals where scan
evidence bears on them; the craft-floor gate (contrast / alignment /
text-hierarchy / spacing / no-fake-data / no-decorative-effects) maps
whichever items have real machine evidence and emits the genuinely
non-machineable ones (contrast, alignment) as human checkboxes with
guidance — never a fake machine verdict. Refusal scaffolds follow, then a
summary verdict computed **only** from the machine-verifiable parts
(PASS = no objections and floor met, REVIEW = copy/design objections,
REFUSE = a machine-checked floor item failed). The checklist itself is
labelled as human steps.

---

## HTTP API

Run with `node api/server.js` (default `PORT=8787`; set `PORT=3000` to
change). When `web/` exists next to the server, `GET /` serves the branded
web checker; otherwise it returns the JSON service descriptor.

### Routes

| Route | Method | Request body | Response |
|---|---|---|---|
| `/` | GET | — | Service descriptor (JSON) or the web checker page (HTML) |
| `/index.html` | GET | — | Web checker page (alias of `/`) |
| `/health` | GET | — | `{"ok":true,"engine":"lazynext-ai-slop-checker","version":"1.4.4"}` |
| `/rules` | GET | — | Corpus manifest: `{engine, version, count, categories[], rules[]}` |
| `/scan` | POST | `{text}` · `{html}` | Scan report `{engine, version, input, score, verdict, clean, totalPoints, matches[], categories[]}` |
| `/scan` | POST | `{url}` | Fetch (10s timeout) + scan; `source` includes fetched `url`/`html`/`text` |
| `/scan` | POST | `{…, rules_url}` | Deep-merge an http(s) JSON rules file before scanning (JSON only) |
| `/scan` | POST | `{text, rewrite:true}` | Adds `rewrite: {text, changed, changes[]}` to the report |
| `/scan` | POST | `{…, profile}` | `"default"`\|`"strict"`\|`"lenient"` severity profile |
| `/judge` | POST | `{text}` · `{html}` · `{project}` | Judge checklist: 5-question review (with machine signals), craft-floor gate, refusal scaffolds, machine `PASS`\|`REVIEW`\|`REFUSE` verdict (`project` = local directory path; not on Workers) |
| `/scan-project` | POST | `{dir, topFiles?, profile?}` | Pooled project report `{engine, version, root, files[], summary, topFiles[], categories[]}` |
| `/render-scan` | POST | `{snapshot}` · `{url}` | Rendered-tier r-* checks over a computed snapshot (pure) or a collected URL (needs playwright) |
| `/mcp` | POST | JSON-RPC 2.0 | MCP: `initialize`, `ping`, `tools/list`, `tools/call` (tools below); GET is 405 (no SSE) |
| `/a2a` | POST | JSON-RPC 2.0 | A2A: `message/send`, `tasks/send`, `tasks/get`; task id == request id |
| `/a2a/tasks/{id}` | GET | — | Replay a completed A2A task result (in-memory, 30-min TTL) |
| `/.well-known/agent.json` | GET | — | Agent discovery card |
| `/widget.js` | GET | — | Embeddable shadow-DOM widget (in-browser engine) |
| `/openapi.json` | GET | — | OpenAPI 3.1 contract for every route |
| `/llms.txt` | GET | — | LLM discovery file |

### Scan report shape

```js
{
  engine: "lazynext-ai-slop-checker",
  version: "1.4.4",
  input: { type: "text", length: 412 },   // text | html | url | render-snapshot
  score: 63,               // 0 (clean) - 100 (max slop)
  verdict: "moderate",     // clean | light | moderate | heavy
  clean: false,            // score <= 9 (or profile threshold)
  totalPoints: 28,
  matches: [{ id, category, severity, kind, index, snippet, context, fix, rewrite? }],
  categories: [{ id, name, count, points }]
}
```

### Judge report shape (POST /judge)

```js
{
  engine: "lazynext-ai-slop-checker-judge",
  version: "1.4.4",
  input: { type: "text", length: 412 },   // text | html | project(dir, filesScanned)
  scan: { project, score, verdict, clean, matches, ... },   // pooled for project
  fiveQuestionReview: [
    { question, hints: [...], verdictHint, signals: [{ id, count }] }
  ],
  craftFloor: [
    { id, name, desc, machine: "ok"|"flag"|"unchecked", evidence: [...], humanCheckbox, guidance }
  ],
  craftFloorMet: boolean,
  refusalScaffolds: [{ name, when, text }],
  summary: { verdict: "PASS"|"REVIEW"|"REFUSE", reasons: [...], machineChecked, humanStepsRequired, note }
}
```

Verdict rules (machine-only boundary):
- **REFUSE** — any *machine-checked* craft-floor item carries `machine:"flag"` (e.g. `d-stat-row` → no-fake-data).
- **REVIEW** — floor passes but machine objections exist (copy/design tells above the clean threshold).
- **PASS** — no machine-verifiable floor violations and no machine objections. The 5-question review and any `humanCheckbox` floor items remain human steps — a human objection flips a machine PASS to REVIEW; `contrast` and `alignment` NEVER carry a machine verdict.

### Project report shape (POST /scan-project)

```js
{
  engine: "lazynext-ai-slop-checker",
  version: "1.4.4",
  root: "/abs/path",
  files: [{ file, kind, score, points, matches, verdict, report? }],
  summary: { filesScanned, filesWithHits, filesSkipped, totalMatches, totalPoints, score, verdict, verdictBands },
  topFiles: [{ file, kind, score, points, matches, verdict }],
  categories: [{ id, count, points }]
}
```

### Render report shape (POST /render-scan)

Same families as the base report, plus `checks` (the r-* manifest) and
`input: { type: "render-snapshot", elements, viewport }`.

---

## MCP (`POST /mcp`, JSON-RPC 2.0)

Methods: `initialize` (protocol `2025-03-26`), `ping`, `tools/list`,
`tools/call`. Batches supported; GET is 405.

| Tool | Input | Returns |
|---|---|---|
| `list_rules` | — | Full corpus (categories + every rule with id/severity/kind/match/fix) |
| `scan_text` | `{text, rewrite?, profile?}` | Text scan report |
| `scan_html` | `{html, profile?}` | HTML scan report (text + design tells) |
| `scan_project` | `{dir, topFiles?, profile?}` | Pooled project report (local filesystem only) |
| `scan_render` | `{snapshot}` · `{url, profile?}` | Rendered-tier report (pure over a snapshot; URL needs the optional collector) |
| `rewrite_text` | `{text}` | Conservative safe rewrites `{text, changed, changes[]}` |
| `judge` | `{text}` · `{html}` · `{dir}` | Judge checklist (5-question review + machine signals, craft-floor gate, refusal scaffolds, `PASS`\|`REVIEW`\|`REFUSE` verdict; `dir` needs local filesystem access) |

```sh
curl -s -X POST localhost:8787/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

---

## A2A (`POST /a2a`, JSON-RPC 2.0)

Methods: `message/send`, `tasks/send`, `tasks/get`. The task id IS the
JSON-RPC request id; results replay via `tasks/get` or `GET /a2a/tasks/:id`
(404 when missing/expired). The local server uses an in-memory store
(200 entries, 30-min TTL). The Worker also writes the `A2A_TASKS` Durable
Object room when that binding is present (one shared object, so another
isolate can read the put as soon as the send finishes) and keeps the
`RECENT` KV namespace as the eventual fallback.

```sh
curl -s -X POST localhost:8787/a2a -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"task-abc","method":"message/send",
       "params":{"message":{"parts":[{"type":"text","text":"We must leverage this."}]}}}'
```

---

## Error codes

### HTTP status codes

| Code | Meaning |
|---|---|
| `400` | Validation error — body explains it (`invalid JSON body`, `provide one of: text, html, url`, `rules_url must be an http(s) URL…`, `snapshot must be an object with an elements array`, …) |
| `404` | Unknown route — body lists the known endpoints |
| `405` | Wrong method — `GET /mcp` and `GET /a2a` return 405 with `Allow: POST` |
| `413` | Body over the 1 MB limit |
| `500` | Internal scan failure |
| `501` | `/render-scan {url}` without the optional playwright collector |
| `502` | Upstream fetch failed (unreachable URL, unsupported content-type, over 2 MB, or `rules_url` fetch failure) |

### MCP / A2A JSON-RPC error codes

| Code | Meaning |
|---|---|
| `-32700` | Parse error (invalid JSON) |
| `-32600` | Invalid request (e.g. batch A2A is not supported) |
| `-32601` | Method not found |
| `-32602` | Invalid params (e.g. `scan_text` without `text`, `message/send` with empty text) |
| `-32000` | Server/scan error (e.g. `task not found: <id>` on `tasks/get`) |

### CLI exit codes

As above: `0` clean, `1` error, `2` findings.