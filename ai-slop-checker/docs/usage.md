# Lazynext AI Slop Checker — usage reference

Complete command-line, API, MCP, and error-code reference for v1.4.0. The
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
| `--json` | — | — | Print the machine-readable report (JSON) instead of the table |
| `--rewrite <text>` | — | — | Also apply conservative safe rewrites to the text |
| `--rules` | — | — | Dump the corpus shorthand (id/category/severity) and exit 0 |
| `--rules <spec>` | path \| glob \| csv list | — | Deep-merge external rules (`.js`/`.json`) for this scan |

### CLI exit codes

| Code | Meaning |
|---|---|
| `0` | Scan ran; report is `clean` (score ≤ threshold) — or `--help`/`--json`/`--rules` dump |
| `1` | Usage/IO error (bad flag value, unreadable file/dir, broken rules file, parse error) |
| `2` | Scan ran; report is **NOT clean** (findings above the threshold) |

### Examples

```sh
node api/cli.js "We must leverage this."
node api/cli.js --file demo/slop.txt --json
node api/cli.js --profile strict "delve deep into this"
node api/cli.js --rules data/rules.ru.js "В современном мире..."
node api/cli.js --rules "rules/**/*.js" --dir src
node api/cli.js --dir path/to/project --top 20 --json
node api/cli.js --snapshot snapshot.json
node api/cli.js --render https://example.com --profile lenient
```

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
| `/health` | GET | — | `{"ok":true,"engine":"lazynext-ai-slop-checker","version":"1.4.0"}` |
| `/rules` | GET | — | Corpus manifest: `{engine, version, count, categories[], rules[]}` |
| `/scan` | POST | `{text}` · `{html}` | Scan report `{engine, version, input, score, verdict, clean, totalPoints, matches[], categories[]}` |
| `/scan` | POST | `{url}` | Fetch (10s timeout) + scan; `source` includes fetched `url`/`html`/`text` |
| `/scan` | POST | `{…, rules_url}` | Deep-merge an http(s) JSON rules file before scanning (JSON only) |
| `/scan` | POST | `{text, rewrite:true}` | Adds `rewrite: {text, changed, changes[]}` to the report |
| `/scan` | POST | `{…, profile}` | `"default"`\|`"strict"`\|`"lenient"` severity profile |
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
  version: "1.4.0",
  input: { type: "text", length: 412 },   // text | html | url | render-snapshot
  score: 63,               // 0 (clean) - 100 (max slop)
  verdict: "moderate",     // clean | light | moderate | heavy
  clean: false,            // score <= 9 (or profile threshold)
  totalPoints: 28,
  matches: [{ id, category, severity, kind, index, snippet, context, fix, rewrite? }],
  categories: [{ id, name, count, points }]
}
```

### Project report shape (POST /scan-project)

```js
{
  engine: "lazynext-ai-slop-checker",
  version: "1.4.0",
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

```sh
curl -s -X POST localhost:8787/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

---

## A2A (`POST /a2a`, JSON-RPC 2.0)

Methods: `message/send`, `tasks/send`, `tasks/get`. The task id IS the
JSON-RPC request id; results replay from an in-memory recent store
(200 entries, 30-min TTL) via `tasks/get` or `GET /a2a/tasks/:id`
(404 when missing/expired).

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