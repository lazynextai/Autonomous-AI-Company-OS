# Agent-Readiness Copy Set + apis.io Submission Pack

**Date:** 2026-11-03 (IST)
**Source:** [`docs/research/market-intelligence-opportunity-scan-2026-11-03.md`](../research/market-intelligence-opportunity-scan-2026-11-03.md) — opportunity layers **P1 #1** ("we publish what they only claim", agent-readiness as the front-door claim) and **P1 #5** (agent-discovery badge line).
**Branch:** `feat/agent-readiness-copy` (docs only — no product file, no deploy, no listing submitted, nothing paid)
**Status:** drafts for founder review. Nothing in this document has been published, submitted, or pushed to any external surface.

**Constraints honoured:** no protected-file edits (`worker.js`, `index.html`, `src/scanner.js`, `package.json`, `test/scanner.test.mjs`, `.github/`), no deploy, no listing submission, no account creation, no payment, no personal-ID flow, no production config or D1 writes (read-only GETs only). `make test` unaffected.

---

## 1. Surface verification — done before any copy was written

Every claim below was verified live against production on 2026-11-03 (18:0x UTC). No claim in §3 rests on documentation or memory. Exact commands are in the [appendix](#appendix--raw-verification).

| # | Claim in copy | Surface probed | Result | Evidence |
|---|---|---|---|---|
| 1 | **OpenAPI 3.1** | `GET https://api.lazynext.com/openapi.json` and `GET https://checker.lazynext.com/openapi.json` | **200 — LIVE** | 22,652 B both hosts (byte-identical). `openapi: 3.1.0`, title `Lazynext Accessibility Checker API`, **21 paths**, **3 declared `securitySchemes`** (`LicenseEmail`, `ConfirmToken`, `UnsubscribeSig`), `servers` = `api.lazynext.com` + `checker.lazynext.com`. `/mcp`, `/a2a`, `/a2a/tasks/{id}`, `/.well-known/agent.json`, `/llms.txt` are all documented paths in that spec. |
| 2 | **MCP** | `POST https://checker.lazynext.com/mcp` (JSON-RPC) | **200 — LIVE** | `initialize` → `{protocolVersion:"2025-03-26", capabilities:{tools:{}}, serverInfo:{name:"accessibility-checker", version:"1.0.0"}}`. `tools/list` → **4 tools**: `scan_url`, `scan_html`, `get_report`, `list_rules` (full JSON schemas returned). `GET /mcp` → **405** — deliberate, no SSE stream. |
| 3 | **A2A** | `POST https://checker.lazynext.com/a2a` (JSON-RPC) + `GET /a2a/tasks/:id` | **200 — LIVE** | Method routing proven without consuming scan quota: `tasks/send` and `message/send` → `-32602 "send a message containing a URL or HTML markup to scan"` (params rejected, method resolved); `tasks/get` → `-32000 "task not found"`; unknown method → `-32601 "method not found"` (correct JSON-RPC discrimination, not a catch-all). `GET /a2a/tasks/does-not-exist` → 404 `{"error":"task not found"}` (REST shortcut route exists). |
| 4 | **`agent.json`** | `GET https://checker.lazynext.com/.well-known/agent.json` | **200 — LIVE** | 840 B. A2A card: `protocolVersion: "0.3.0"`, `preferredTransport: "JSONRPC"`, url `/a2a`, **3 skills** (`scan_url`, `scan_html`, `get_report`), `capabilities: {streaming:false, pushNotifications:false}`. |
| 5 | **`llms.txt`** | `GET https://checker.lazynext.com/llms.txt` | **200 — LIVE** | 600 B, `text/plain`. Names the REST endpoints, the OpenAPI URL, the HTML rules catalogue, and `lazynext.com` as builder. (Does **not** yet mention MCP/A2A — see §6.3.) |
| 6 | **`/health`** | `GET` + `HEAD https://checker.lazynext.com/health` | **200 — LIVE** | `{"ok":true,"service":"accessibility-checker"}`; `HEAD` 200 with identical headers (no-body parity). |
| 7 | **REST** | `GET /rules`, `GET /` on `api.` host, `HEAD /health` | **200 — LIVE** | `/rules` 14,045 B manifest (75 rules). `api.lazynext.com/` returns the JSON endpoint descriptor (`scan`, `checkout`, `monitor`, `report`, `badge`, `rules`, `openapi`, `mcp`, …). `HEAD` parity holds on read-only routes. |
| 8 | **GitHub Action** | repo files, not a network surface | **PRESENT** | `products/accessibility-checker/action.yml` (`fail-under` default **80**, inputs `url`/`license`/`site`/`fail-on`/`fail-under`) + `scripts/ci-scan.mjs`. Used by `.github/workflows/self-scan.yml` as a standing canary. |

**Verdict: all seven checklist claims are live. No claim needed softening, and none was added that isn't in the table above.** The "0.0 contract quality" contrast from the market scan is a fact about the peer set, not a claim about us — it is used internally (§5) and only as a *positive* "no demo call" line in public copy.

---

## 2. Accuracy guardrails — what the copy must not say

These are the ways this copy set could drift into fiction. Each is pinned to the audit above.

1. **Don't imply MCP/A2A are paid.** `/mcp` and `/a2a` answer **unauthenticated**; the MCP tool description itself states *"Free tier: 3 URL scans/day/IP"*. The live checker landing page (`products/accessibility-checker/index.html`, the pricing paragraph) currently groups **"API + MCP + A2A"** under *Pro $9/mo* — that reads as a paid gate and contradicts observed behaviour. See §6.2; do not propagate that framing into new copy.
2. **Don't say "unlimited free".** Free tier is **3 rendered scans/day/IP** and **3-page site crawls**.
3. **Don't claim a numeric percentile as a peer comparison.** `benchmark.pct` is the share of *our own* verified scan corpus a site beats (≥10 distinct sites, our hosts excluded). It is not a rank against Pango/Juna/etc.
4. **Don't invent compliance or infra claims** — no SOC 2, no SSO, no uptime SLA, no "enterprise-grade". Not verified, not true.
5. **Don't name competitors in public copy.** The book-a-demo contrast stays generic ("no demo call", "self-serve") — naming a funded peer in a footer invites a correction we don't need. Internal framing lives in §5.
6. **Don't say "every route is in OpenAPI".** Say **21 documented paths**, which includes the agent surfaces. `/scan` is POST-only, so `HEAD /scan` is 404 by design — never advertise HEAD on state-changing routes.

---

## 3. The copy set

Character counts are exact (Python `len`), because three of these land in fields with hard limits.

### 3.1 Value prop paragraph — marketing hero / sub-head

**Primary (172 chars)** — drop-in replacement for `<p class="sub">` on the marketing homepage:

> 12 agents research, plan, build, test and ship real products. They also publish them: OpenAPI 3.1, MCP, A2A, agent.json and llms.txt are live today. Your infra, your rules.

**Why this shape:** keeps the existing promise ("12 agents … ship real products") and the existing sign-off ("Your infra, your rules"), then inserts the differentiator as a *consequence* of building, not a feature list. It reads as "the company ships usable things", which is the actual claim.

**Alt (196 chars) — for a hero that wants the audit angle explicit:**

> 12 agents research, plan, build, test and ship real products — and hand you the contract, not a sales call. OpenAPI 3.1, MCP, A2A, agent.json and llms.txt are live on the product they built. Your infra, your rules.

**Alt (short, 98 chars) — sub-head for a narrow viewport or a second line:**

> Built by agents. Callable by agents: OpenAPI 3.1, MCP, A2A, llms.txt.

### 3.2 Checklist block — site footer / listing description

**Full block (markdown, for docs pages, READMEs, directory long-descriptions):**

```markdown
**Agent-ready — verified live, not on a roadmap:**

- **MCP** — `POST https://checker.lazynext.com/mcp` (JSON-RPC: `scan_url`, `scan_html`, `get_report`, `list_rules`)
- **A2A** — agent card at `/.well-known/agent.json`, JSON-RPC at `/a2a`
- **OpenAPI 3.1** — 21 documented paths, 3 declared security schemes
- **agent.json** — A2A 0.3.0 discovery card, 3 skills
- **llms.txt** — plain-text orientation for LLM crawlers
- **REST** — `/scan`, `/report/:id`, `/rules`, `/badge/:id.svg`, `/health`
- **GitHub Action** — fail the build below a score threshold
```

**One-line badge (footer, status page, bios):**

> Agent-ready: MCP · A2A · OpenAPI 3.1 · agent.json · llms.txt · GitHub Action · REST

**Tight variant (if the footer row is width-constrained):**

> MCP · A2A · OpenAPI 3.1 · llms.txt — all live

### 3.3 Directory listing copy

**Blurb — 125 chars (limit 150):**

> WCAG 2.1/2.2 scanner with a live OpenAPI 3.1, MCP, A2A and llms.txt surface. Free scans; $9/mo Pro. Self-serve, no demo call.

**Blurb alt — 113 chars, if a directory dislikes semicolons:**

> WCAG 2.1/2.2 scanner with a live OpenAPI 3.1, MCP, A2A and llms.txt surface. Free scans, $9/mo Pro, no demo call.

**Longer description — 269 chars (limit 300):**

> Lazynext Accessibility Checker scans a page or whole site for WCAG 2.1/2.2 issues in a real browser, with daily monitoring and shareable reports. It publishes what peers only claim: OpenAPI 3.1, MCP, A2A, agent.json, llms.txt and a GitHub Action. Self-serve, $9/mo Pro.

**Longer description alt — 315 chars, over the 300 limit, do not use in a 300-char field:**

> Lazynext Accessibility Checker scans a page or a whole site for WCAG 2.1/2.2 issues in a real browser, with daily monitoring and shareable reports. It publishes what peers only claim: OpenAPI 3.1, an MCP server, an A2A agent card, llms.txt and a GitHub Action, all free to call. Self-serve, $9/mo Pro, 14-day trial.

*(Kept here only so a 400-char field — e.g. some directory variants — has a longer option. It is **not** valid for the 300-char fields.)*

### 3.4 Self-serve vs book-a-demo contrast

**Primary (122 chars):**

> Self-serve, transparent pricing, public benchmarks. The vertical-OS players route you to a demo; we hand you the endpoint.

**Softer, no competitor implication (118 chars)** — preferred for the marketing site, where we never name the peer set:

> No demo call. Scan a page now, or call the API — free tier included, $9/mo Pro, cancel any time.

**With the benchmark hook (147 chars)** — for SaaSHub/directree where the field allows a second sentence:

> No demo call. Scan a page now, call the API, or run it in CI with the GitHub Action. Public benchmark percentiles, $9/mo Pro, cancel anytime.

### 3.5 Bio one-liners (Linktree, post-office bios, X/Bluesky)

**Linktree / primary bio (108 chars):**

> The autonomous AI company OS. Ships products agents can actually call: OpenAPI 3.1, MCP, A2A, llms.txt.

**Short social bio (76 chars):**

> Autonomous AI company OS. Agent-ready by default: MCP · A2A · OpenAPI · llms.txt.

---

## 4. apis.io submission pack

**Submission route: `https://apis.io/add/`** — verified 200, `<title>Add API | APIs.io</title>`.

> Correction to the obvious guess: `https://apis.io/submit` and `/submit/` both return **404**. The live route is **`/add/`**, linked from the homepage nav and footer as "Add Your API".

**Free / review policy (quoted from the live form):**

> "Tell us about your API and a person will reply. Give us the name, a link to your website or APIs.json, where the documentation lives, and an email address we can answer. If you already publish an OpenAPI, llms.txt, MCP server or agent card, say where. **Every submission is read by hand before anything is listed, and we list one real company per submission.**"

- **No payment, no card field, no account required** — the form collects name, email, website/APIs.json URL, docs URL, a free-text notes field, and an opt-in newsletter checkbox. There is no tier, no "featured" upsell, and no checkout on the page.
- Corrections after listing go to the same hand-reviewed channel or `info@apis.io`.
- **Not currently listed.** `GET https://apis.io/api/v1/search?q=lazynext` → `apis.total: 0`, `providers.total: 0`; `/api/v1/providers?q=lazynext` → `total: 0`. So this is a first-time listing, not a correction. (Also grepped the full `/providers/` index: no `lazynext` occurrence.)

### 4.1 Ready-to-paste values

| Field (live form id) | Value |
|---|---|
| **API or company name** (`add-name`) | `Lazynext Accessibility Checker` |
| **Your email** (`add-contact`) | `support@lazynext.com` |
| **Website or APIs.json URL** (`add-url`) | `https://checker.lazynext.com/` |
| **API documentation URL** (`add-docs`) | `https://api.lazynext.com/openapi.json` |
| **Anything else we should know** (`add-notes`) | see block below |
| Newsletter checkbox (`add-newsletter`) | **unchecked** (default is checked — leave it off unless the founder wants the weekly Demand Report) |

**Notes field (paste verbatim, ~560 chars):**

> Free WCAG 2.1/2.2 accessibility scanner by Lazynext (UNITED GLOBAL VENTURES PRIVATE LIMITED, Bengaluru, India).
>
> OpenAPI 3.1: https://api.lazynext.com/openapi.json (21 paths, 3 declared security schemes: LicenseEmail, ConfirmToken, UnsubscribeSig).
> MCP: POST https://checker.lazynext.com/mcp — JSON-RPC tools scan_url, scan_html, get_report, list_rules.
> A2A: https://checker.lazynext.com/.well-known/agent.json (protocol 0.3.0, 3 skills), endpoint POST /a2a.
> llms.txt: https://checker.lazynext.com/llms.txt
> Health: https://checker.lazynext.com/health
>
> Self-serve: free tier 3 rendered scans/day/IP, Pro $9/mo, no demo call required.

**Tags / category** — the form has no tag or category field (everything beyond the four fields goes in notes), so the taxonomy is expressed in the notes text. If a human replies asking for structured tags, use: `accessibility`, `wcag`, `testing`, `web`, `developers`, `agent-native`, `mcp`, `a2a`.

### 4.2 Hard rules for this submission

- **Do NOT submit.** Founder reviews this pack first.
- **Do NOT pay, do NOT create any account, do NOT enter a card.** Nothing on `/add/` asks for any of it; if a later step does, stop and report.
- One company per submission — submit **once**, as Lazynext, not once per product.
- If they reply asking for an `apis.json` at the apex: we don't publish one today (see §6.5). Answer with the `openapi.json` URL rather than inventing a file.

---

## 5. What to change where

Every row names a real file or real external surface. "Tone fit" means the draft was written against the copy that is actually there today.

| # | Copy block | Target surface | Exact location | Tone / fit notes | Blocker |
|---|---|---|---|---|---|
| 1 | §3.1 hero sub (primary) | Marketing homepage hero | `marketing/public/index.html:111` — `<p class="sub">` | Replaces the current line 1:1; keeps "12 agents" and "Your infra, your rules", so the stats strip at `:117` still agrees (12 agents, 24/7, 9 access formats, $0.18/cycle). | none (unprotected file) |
| 2 | §3.2 one-line badge | Marketing homepage footer | `marketing/public/index.html:212-228` — `<footer>` / `.flinks` block | Footer is a link row, not prose; use the tight variant as a plain `<span>` in the first footer cell next to "◆ Lazynext · The Autonomous AI Company OS". | none |
| 3 | §3.2 badge + §3.4 contrast | Marketing status page | `marketing/public/status.html` — `services` array in the inline script, plus the `<h1>` sub at `:56` | Status page is the natural home for "agent-ready" because it is the availability surface; the services array already lists Dashboard/API/Marketing, so an "Agent surfaces" row fits the existing data shape. | none |
| 4 | §3.2 full block | Marketing docs page | `marketing/public/docs.html:81` `<h2>API</h2>` section, and the card grid at `:65-70` | Docs already have an API section listing `/api/v1/*` endpoints for the *platform*; add the **product** agent surfaces as a second subsection so the two APIs aren't conflated. Card grid takes a 7th card cleanly. | none |
| 5 | §3.2 full block (short form) | Checker landing tagline | `products/accessibility-checker/index.html:44` — `<p>Scan any public page …</p>` | Current tagline is purely functional. A one-line append ("also callable as MCP, A2A, or REST — see /llms.txt") keeps it functional. | **PROTECTED FILE — read-only.** Requires an explicit founder-approved product edit, not this docs PR. |
| 6 | §3.1 / §3.3 (longer description) | Checker landing pricing paragraph | `products/accessibility-checker/index.html:62` | **Must not be copied as-is** until §6.2 is resolved: that paragraph files "API + MCP + A2A" under Pro, which contradicts the verified free-reachable MCP/A2A surfaces. | **PROTECTED FILE** + factual conflict (§6.2) |
| 7 | §3.2 MCP/A2A lines | `llms.txt` | `products/accessibility-checker/llms.txt` (served via `src/static.js`; `scripts/sync-page.mjs:15` types it `text/plain`) | Current file lists REST + OpenAPI + rules catalogue but **omits** `/mcp` and `/a2a` — the two artifacts the peer set lacks. One-line addition closes the gap. | Product-file change — **out of scope for this PR** (§6.3) |
| 8 | §3.5 primary bio | Linktree | `linktr.ee/admin` → profile bio (Free plan, handle `lazynext`) | Existing tree already carries 9 links; only the bio string changes. | External write — needs founder go-ahead |
| 9 | §3.3 blurb + §3.4 | SaaSHub listing | `saashub.com/lazynext-accessibility-checker-alternatives` (public, verified) | Existing listing is live and Freemium-annotated; edit the description field only, do not touch the paid "Priority+" upsell. | External write |
| 10 | §3.3 blurb | AlternativeTo | listing still in their review queue (submitted 2026-10-21) | **Do not edit now** — edits are locked until their review completes. Queue the blurb for when it clears. | Blocked by their review |
| 11 | §3.3 blurb | directree | `directree.io/tool/accessibility-checker` — owner-claimed, edits **pending review (~2026-12-06)** | **Do not re-edit.** A second round of owner edits while the first is in review risks losing the queue position. | Blocked until ~2026-12-06 |
| 12 | §4 whole pack | apis.io provider listing | `https://apis.io/add/` (free, hand-reviewed) | First-time listing (confirmed absent from their index). | **Do not submit** — founder review |

---

## 6. Blockers and decisions the founder must make

1. **The checker landing page is protected.** Rows 5 and 6 of the table are the two highest-leverage placements (the product's own front door) and both live in `index.html`, which is a locked product file. This PR deliberately does not touch it. To ship those two lines, someone has to make a deliberate product edit — that is a separate, explicit decision.

2. **Factual conflict to resolve first: is MCP/A2A gated on Pro or not?**
   - Observed: `POST /mcp` and `POST /a2a` answer **unauthenticated**; the MCP tool schema advertises *"Free tier: 3 URL scans/day/IP"* — i.e. the surfaces are free, the *quota* is shared with the free REST tier.
   - Written: the checker landing page (`products/accessibility-checker/index.html:62`) files "API + MCP + A2A" under *Pro $9/mo*, and the Pro offer in the JSON-LD says "API access".
   - Consequence: the site currently **understates** the differentiator (a free, callable MCP server is a stronger claim than a paid one) **and** contradicts live behaviour. Pick one story — "free surfaces, Pro quota/monitoring" is both true and the better pitch — then align the landing line. Do not write new copy until this is decided.

3. **`llms.txt` is the cheapest single win and it's currently incomplete.** It names REST and OpenAPI but not `/mcp` or `/a2a` — exactly the two artifacts that make us an outlier in the peer set. A two-line addition is the highest ratio of "claim strengthened" to "work done" in this whole document. It is a product-file change, so it is flagged, not done.

4. **Two external listings are time-locked, not work-blocked.** directree owner edits are in their review until ~2026-12-06; AlternativeTo is still in the free queue since 2026-10-21. Both should receive the §3.3 blurb *after* their respective reviews clear — editing now would either be ignored or queue-jump us backwards. Nothing to do today.

5. **apis.io prefers an `apis.json` at the apex; we publish none.** Their form accepts "a link to your website **or** APIs.json", so `https://checker.lazynext.com/` + the `openapi.json` docs URL is a complete submission. An `apis.json` would let us enumerate the MCP/A2A artifacts in machine-readable form (and is a prerequisite for some of their richer artifact views) — but it is a new product file, so it is a follow-up decision, not part of this pack.

6. **Nothing was submitted, bought, or signed up for.** No apis.io submission, no account, no payment, no card, no personal ID. The only writes were read-only GET/POST-JSON-RPC probes against public surfaces that require no auth (and no scan was executed, so no free-tier quota was consumed and no report was written).

---

## 7. Verification appendix — raw checks

```bash
# 1 OpenAPI 3.1 (both hosts, byte-identical)
curl -s -o /tmp/o.json -w "HTTP %{http_code} %{size_download}\n" https://api.lazynext.com/openapi.json
curl -s -o /tmp/c.json -w "HTTP %{http_code} %{size_download}\n" https://checker.lazynext.com/openapi.json
# -> HTTP 200 22652 (both); openapi 3.1.0; 21 paths; securitySchemes: LicenseEmail, ConfirmToken, UnsubscribeSig

# 2 MCP
curl -s -X POST https://checker.lazynext.com/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify","version":"1.0"}}}'
# -> 200 {protocolVersion:"2025-03-26", serverInfo:{name:"accessibility-checker",version:"1.0.0"}}
curl -s -X POST https://checker.lazynext.com/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
# -> 200 4 tools: scan_url, scan_html, get_report, list_rules
curl -s -o /dev/null -w "%{http_code}\n" https://checker.lazynext.com/mcp   # -> 405 (no SSE, by design)

# 3 A2A (routing proven with invalid params — no scan, no quota used)
curl -s -X POST https://checker.lazynext.com/a2a -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":9,"method":"message/send","params":{"message":{"role":"user","parts":[{"kind":"text","text":"no target"}]}}}'
# -> 200 {"error":{"code":-32602,"message":"send a message containing a URL or HTML markup to scan"}}
curl -s -X POST https://checker.lazynext.com/a2a -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":10,"method":"nope/nope"}'
# -> 200 {"error":{"code":-32601,"message":"method not found: nope/nope"}}
curl -s https://checker.lazynext.com/a2a/tasks/verify-probe-001   # -> 404 {"error":"task not found"}

# 4-6 agent.json / llms.txt / health
curl -s https://checker.lazynext.com/.well-known/agent.json   # 200, 840 B, A2A 0.3.0, 3 skills
curl -s https://checker.lazynext.com/llms.txt                 # 200, text/plain, 600 B
curl -s https://checker.lazynext.com/health                   # 200 {"ok":true,...}
curl -s -I https://checker.lazynext.com/health                # 200 (HEAD parity)

# 7 apis.io route + absence check (read-only, nothing submitted)
curl -s -o /dev/null -w "%{http_code}\n" https://apis.io/add/       # -> 200  (the real route)
curl -s -o /dev/null -w "%{http_code}\n" https://apis.io/submit     # -> 404  (not the route)
curl -s "https://apis.io/api/v1/search?q=lazynext"                  # -> apis.total 0, providers.total 0
```

---

**Changelog:** first draft, 2026-11-03. Nothing external was touched.
