# Scan traffic provenance — are the 132 "scans" real external traffic?

**Status:** REAL analysis — read-only. Every figure below was read live from production on
2026-11-03 between 22:35 and 00:00 IST (17:05–18:30 UTC) via the internal bearer
(`CLOUDFLARE_API_TOKEN`) against the platform worker: `POST /kv/list`, `POST /kv/get`,
`POST /query` (**SELECT only**), `GET /api/v1/billing/funnel`, and a read-only
`gh run list`. Nothing was written — no KV put/delete, no D1 insert/update, no task created,
no email or connector dispatch. `make test` untouched (doc only).
**Branch:** `feat/scan-provenance-audit`. **Author:** manual human-run audit pass.

**Question:** the funnel reports `scans_30d: 132` but `leads: 1`. Is that 132 real external
traffic (→ a **conversion** problem) or our own dogfood/E2E/test scans (→ a **distribution**
problem)?

**Answer, up front: 7 of 132 scans are external (5.3%); 125 are ours (94.7%). The one "lead"
is our own probe address. There is effectively no real external traffic — this is a
DISTRIBUTION problem, not a conversion problem.** Evidence and qualifications in §1–§7.

---

## 1. Where `scans_30d` comes from (code path)

`scans_30d` is not a counter and not an analytics event — it is the size of the KV key set
`report:*`:

```ts
// worker/src/billing.ts:491 and :513
listAll(env.EPHEMERAL, "report:"),
...
scans_30d: reports.length,
```

Each report key is written by the product scan pipeline on **every** successful scan
(web UI, MCP, A2A, widget — all share `runScan`), with a 30-day TTL:

```js
// products/accessibility-checker/src/scan_pipeline.js:173
await kv.kvPut(env, `report:${id}`, JSON.stringify({ ...result, url: url ?? null, ts: Date.now() }), 2592000);
```

Two consequences that matter for the audit:

1. **`report:*` has no notion of who scanned or where from.** It stores `url`, `ts`, `score`,
   `rendered`, `plan`, `issues`, `pages` — and, critically, **no client IP, no user-agent, no
   entry-surface tag**. Provenance can therefore only be reconstructed from cadence
   (machine-regular timestamps), payload fingerprints, and external corroboration (CI run
   logs, monitor KV state). That gap is itself a finding (§8, R2).
2. **Pasted-HTML scans are not rate-limited at all** — the free 3/day quota is inside
   `if (!pro && url)`, so a `{html: ...}` body with no `url` bypasses it
   (`scan_pipeline.js:58`). This is why scripted pasted-HTML bursts can exceed 3/day per IP,
   and it is how the largest test bucket accumulated (§4.4).

`report:*` counts *successful* scans only (quota rejections and 4xx/5xx never write a key),
so 132 is a floor on attempts, not a count of visitors.

---

## 2. Enumeration — was every record readable?

| Step | Call | Result |
|---|---|---|
| Key enumeration | `POST /kv/list {"prefix":"report:"}` | **132 keys** — matches the funnel exactly (`scans_30d: 132`) |
| Pagination truncation? | route uses `listAll()` internally (`worker/src/index.ts:355-359`) | **No truncation** — paginates cursors internally; 132 is far under the 1000-key page cap anyway |
| Record fetch | `POST /kv/get` × 132 | **132/132 parsed**. 0 missing, 0 unparsable |
| Fields present | — | `url`, `ts`, `score`, `plan`, `rendered` present on all 132 (`ts` missing on **0** records) |
| Window | derived from `ts` | `2026-10-05T12:41:30Z` → `2026-11-03T14:07:43Z` (29.1 days — consistent with the 30-day TTL; the 2026-10-04 tail has expired) |

So the split below is **exhaustive, not sampled**: every one of the 132 records is classified.

---

## 3. The split

| Bucket | Records | % of 132 | What it is |
|---|---:|---:|---|
| **Own / operator** | **78** | **59.1%** | our own domains, reserved test domains, SSRF fixture |
| **Pasted HTML (`url: null`)** | **47** | **35.6%** | scripted/test payloads — programmatic, proven in §4.4 |
| **External real** | **7** | **5.3%** | 6 public hosts, listed in §4.5 |
| **Ours, total (own + pasted)** | **125** | **94.7%** | |

Per host (all 132 records):

| Host | Records | Bucket | Attribution |
|---|---:|---|---|
| `(pasted HTML, url = null)` | 47 | ours (test) | programmatic bursts + fixture reuse (§4.4) |
| `lazynext.com` | 35 | ours | dogfood monitor sweep (§4.1) |
| `checker.lazynext.com` | 33 | ours | GitHub Actions self-scan canary (§4.2) |
| `example.com` | 7 | ours | IANA reserved test domain |
| `www.corpusiq.io` | 2 | **external** | §4.5 |
| `127.0.0.1:9/callback` | 2 | ours | SSRF regression fixture (port 9 = discard) |
| `en.wikipedia.org` | 1 | **external** | §4.5 |
| `raw.githubusercontent.com` | 1 | **external** | §4.5 — bot probe |
| `www.catalyst.org` | 1 | **external** | §4.5 |
| `stage-t4.coloradomtn.edu` | 1 | **external** | §4.5 |
| `gozig.com` | 1 | **external** | §4.5 |
| `shop.example.org` | 1 | ours | reserved `example.org` subdomain |

Attribute cross-tab (same 132 records):

| Bucket | plan=pro | plan=free | rendered | site-wide |
|---|---:|---:|---:|---:|
| own (78) | 35 | 43 | 75 | 0 |
| pasted (47) | 0 | 47 | 0 | 0 |
| external (7) | 0 | 7 | 7 | 0 |

---

## 4. Proof per bucket

### 4.1 `lazynext.com` — 35 scans = the dogfood monitor, not customers

- **Cadence:** one scan every **20.16 h** (median gap; min 19.99 h, max 20.18 h) across
  **30 distinct UTC days**. That is a machine on an `~20h` gate, not people. The gate is the
  platform's daily maintenance sweep (`maint:last_run` ≈ 20 h).
- **Attribution:** KV `mon:support@lazynext.com:1w1fov0` =
  `{"url":"https://lazynext.com","email":"support@lazynext.com","last_score":98,"last_scan_at":1793665828190,"scans":46,"alerts":0}`.
  `last_scan_at` = **2026-11-03T00:30:28.190Z**, which is byte-for-byte the newest
  `lazynext.com` report's `ts` (**2026-11-03T00:30:28.041Z**). The monitor is the only
  `mon:*` record besides `mon:last_sweep`, consistent with `monitors: 1` in the funnel.
- **Shape:** all 35 are `plan=pro` / `viewport=desktop` / `rendered=true`; score 98 on 32 of
  them and 95 on 3 — a monitor re-scanning one unchanged marketing page.
- **Gate trace:** `mon:last_sweep` = `{"at":1793665828393,"scanned":1,"errors":[]}` — one
  URL scanned per sweep, zero errors.

### 4.2 `checker.lazynext.com` — 33 scans = the CI canary, matched to workflow runs

`products/accessibility-checker/.github/workflows/self-scan.yml` scans
`https://checker.lazynext.com` on push + daily cron (`17 6 * * *`) with no license, so it
lands as a **free, mobile-viewport, score-96** report — which is exactly what all 33 records
are (`plan=free`, `viewport=mobile`, `rendered=true`, score 96, 1 issue, every time).

Independent corroboration, not inference: `gh run list --repo Lazynext-AI/accessibility-checker
--workflow self-scan --limit 60` returns the run's `createdAt`. **All 33 reports match a run
within 50 seconds** (median 21 s, max 49.1 s), e.g.:

| Report `ts` (UTC) | Nearest `self-scan` run `createdAt` | Δ | event |
|---|---|---:|---|
| 2026-11-03 14:07:43 | 2026-11-03T14:06:56Z | 47 s | schedule |
| 2026-11-02 15:43:37 | 2026-11-02T15:43:16Z | 21 s | schedule |
| 2026-11-01 13:16:58 | 2026-11-01T13:16:09Z | 49 s | schedule |
| 2026-10-24 18:58:33 | 2026-10-24T18:58:23Z | 11 s | push |
| 2026-10-06 13:15:53 | 2026-10-06T13:15:42Z | 11 s | schedule |

(The extra same-day scans on 2026-10-24 at 18:58 and 19:34 are the `push`-triggered runs of
the same workflow.) **33/33 accounted for — zero unattributed.**

Corroborating IP: the only surviving free-quota key today is
`rl:scan:130.131.214.133:2026-11-03` (1 scan, TTL ~25 h), and `130.131.214.133` falls inside
GitHub's published `actions` range **130.131.128.0/17** (`https://api.github.com/meta`). Our
own egress IP is **49.205.194.4**, so this key is the runner, not the founder's Mac.

### 4.3 `example.com` (7), `shop.example.org` (1), `127.0.0.1` (2) — fixtures

- `example.com` — 7 scans, every one score **85**, 3 distinct days; three of them within
  2 min 17 s on 2026-10-15 (20:13:01, 20:14:00, 20:15:18) and two 15 s apart on 2026-10-11.
  IANA reserved domain; no human visits `example.com` to audit accessibility.
- `shop.example.org` — reserved `example.org` subdomain (single scan, 2026-10-21 08:12:37).
- `127.0.0.1:9/callback` — loopback on the discard port, twice (2026-10-08) — the SSRF-guard
  regression fixture from `worker/src/sign.ts` work.

### 4.4 Pasted HTML (47, `url: null`) — programmatic, proven by timing and payload reuse

This is the second-largest bucket and the one that most inflates the funnel. It is not
47 people pasting markup:

- **Burst structure.** The 47 scans collapse into **17 clusters**; the tightest are
  **5 scans in 0 seconds** (2026-10-11 20:40:42, 20:42:49, 22:54:38, 23:32:28),
  **4 in 0 s** (21:39:08, 23:12:35) and **5 in 6 s** (2026-10-21 08:11:12→08:11:18).
  A human cannot submit five scans inside the same second — each needs a paste, a click and
  a round-trip. These are loops.
- **Concentration.** **35 of the 47** happen on a single evening (2026-10-11, 20:36–23:35),
  in 9 bursts.
- **Payload reuse.** Hashing each report's full issue payload (rule/selector/message +
  score) yields only **16 distinct fingerprints** for 47 scans; the top five repeat
  **8, 7, 7, 6 and 6** times — i.e. **34 of 47 (72%) are the same handful of HTML blobs
  scanned over and over on different days.** That is fixture reuse, not traffic.
- **Why it isn't blocked:** pasted-HTML scans sit outside the 3/day free quota
  (`scan_pipeline.js:58` guards on `url`), so a test loop is unlimited.
- **What the payloads are not:** running the repo's own scanner over the repo fixtures
  (`targets.html` → `wcag-1.3.1`/94; `trap.html` → `wcag-2.1.2,wcag-2.4.4`/88; `shadow.html` →
  100; etc.) does **not** reproduce these signatures (dominant ones are `wcag-1.1.1` alone/94,
  `wcag-1.1.1,wcag-2.4.2`/88, empty/100, `wcag-1.3.5,3.3.2,3.3.5,3.3.6,4.1.2`/81). So they are
  ad-hoc markup blobs fed by tooling (agent verification runs / scripts), not the committed
  fixtures and not a human reviewer.
- **Honest limit:** the reports store no caller identity, so I can prove these are
  *machine-generated and repeated*, but not *whose* machine. Given that no external domain
  traffic exists in the same window (§4.5) and every attributable scan in it is ours, the
  only consistent reading is our own test/verification tooling. Counted as **ours**.

### 4.5 External — 7 scans across 6 public hosts

| Host | Scans | First → last (UTC) | Score | Notes |
|---|---:|---|---:|---|
| `www.corpusiq.io` | 2 | 2026-11-01 04:02:33 → 04:06:25 | 46 | the only **repeat** visitor; same URL scanned twice 3 min 52 s apart |
| `en.wikipedia.org` | 1 | 2026-10-05 23:24:09 | 5 | Wikipedia article |
| `www.catalyst.org` | 1 | 2026-10-12 02:59:08 | 18 | nonprofit site |
| `stage-t4.coloradomtn.edu` | 1 | 2026-10-12 20:02:30 | 37 | staging host of a community college |
| `gozig.com` | 1 | 2026-10-15 17:26:58 | 59 | small business site |
| `raw.githubusercontent.com` | 1 | 2026-10-18 13:26:16 | 74 | URL is `.../qygtyoo1/hermes-skillb/master/.well-known/agent.json` — an **agent/crawler probing**, not a customer evaluating their site |

All 7 are `plan=free` and `rendered=true`. **No external scan has arrived in the last
2.7 days** (last: 2026-11-01 04:06:25Z).

Reading, honestly:

- `corpusiq.io` (2 scans, 4 min apart, no corresponding `task_log` row, not in `crm_leads` or
  `email_contacts`) is the single most plausible **genuine outside user**: scan, look at the
  score, re-run to check it is stable. Still unprovable (§8, L1).
- `raw.githubusercontent.com` scanning an `agent.json` is a bot hitting the MCP/A2A-era
  surface — evidence that *agentic* discovery is reaching us, but it is not a human lead.
- The remaining 4 are one-off single scans with no follow-up.

So: **≤7 external scans in 30 days; 1–2 probably human; 0 converted to any email.**

---

## 5. Cross-check against D1 `scan_stats` — useful, but *not* independent

`scan_stats` is the benchmark corpus and is supposed to hold "real usage" only
(`benchHost()` at `scan_pipeline.js:22` excludes our domains, `example.*`, reserved TLDs,
localhost and bare IPs). Live state:

```
SELECT COUNT(*) c, COUNT(DISTINCT host) h FROM scan_stats   -- 38 rows / 27 distinct hosts
```

**What the host list actually shows: 23 of the 38 rows are attributable to us or to
pasted-URL artifacts, not to outside traffic:**

| Group | Rows | Evidence |
|---|---:|---|
| Our own hosts that `benchHost()` fails to exclude | 7 | `lazynext.github.io` 4, `lazynext-landing.github.io` 2, `shop.example.org` 1 |
| Malformed hostnames carrying punctuation | 3 | `agent-forum.agent-forum-worker.workers.dev)`, `...workers.dev),`, `wellknown.network),` — pasted URL lists, the trailing `)` survived |
| One 4-minute manual QA burst | 13 | 2026-09-27 10:18:19 → 10:24:03 over deque/gov.uk/whitehouse/wikipedia/github/mozilla/web.dev/apple/wix/wordpress/nytimes/mdn/stackoverflow |

Neither `*.workers.dev` nor `*.example.org` is in `benchHost()`'s exclusion list, so the
corpus is not the clean "external only" set it is documented to be. Of the 15 remaining rows,
4 are `www.wikipedia.org` (13 min apart on 2026-09-28) and 2 are `www.w3.org` (also likely
benchmark seeding); the genuine-usage residue is essentially **the same 2 `corpusiq.io` rows
plus a handful of singles** — which agrees with the report-level finding rather than adding
to it.

Two side effects worth recording:

- `scan_stats` is **cumulative since 2026-09-26** (no TTL) while `report:*` rolls at 30 days,
  so the two numbers are not comparable — `38 rows / 27 hosts` is not "more traffic than
  132 scans".
- The user-visible `benchmark.pct` (`"your score beats N% of M sites"`) is computed over this
  corpus. With ~23/38 rows ours, that percentile is largely a comparison **against our own
  scans** — fine as a smoke signal, not market data.

---

## 6. The lead — `leads: 1` is our own probe

| Fact | Value | Source |
|---|---|---|
| Funnel `leads` | 1 | `GET /api/v1/billing/funnel` |
| Raw `lead:*` keys | 3 (`lead:conn-sweep-probe@example.com` + `:joined` + `:stage`) | `POST /kv/list {"prefix":"lead:"}` |
| The address | **`conn-sweep-probe@example.com`** — a reserved `example.com` domain, named for our connector sweep | `POST /kv/get` on each key |
| Joined | `1790573843361` → **2026-09-28T05:37:23Z** | KV `lead:...:joined` |
| Value | `waitlist` | KV `lead:conn-sweep-probe@example.com` |
| D1 `waitlist` | 1 row: id 11, `conn-sweep-probe@example.com`, `source='landing'`, 2026-09-28 05:37:21 | `SELECT id,email,source,created_at FROM waitlist` |

**The single lead is our own integration probe.** There is no real signup in the funnel.

Second, independent confirmation that no visitor has ever handed us an email through the
product: `email_contacts` (49 rows) is **100% ours** —

```
SELECT source, subscribed, COUNT(*) FROM email_contacts GROUP BY source, subscribed;
-- crm-outbound / subscribed=1 : 32
-- crm-outbound / subscribed=0 : 16
-- waitlist     / subscribed=0 :  1   (the same probe)
```

Zero rows sourced from `accessibility-checker` (the source string `POST /lead` sends), despite
the product UI shipping two email captures (the always-visible "Email for updates" field and
the "free limit reached → drop your email" path). Not one outside scan has ever reached either.
`crm_leads` (68 rows) is likewise `serper-prospecting` 67 + 1 null — our outbound list, not
inbound.

---

## 7. Verdict

> **7 of 132 scans are external real traffic (5.3%); 125 are ours (94.7%). Effectively zero
> real external traffic — 1–2 probably-human scans in 30 days, and 0 converted. The one
> funnel "lead" is our own `conn-sweep-probe@example.com` probe.**

**This is a DISTRIBUTION problem, not a conversion problem.** Reasoning, in order of strength:

1. **Direct provenance (decisive).** 33/33 `checker` scans match CI runs to within 50 s;
   35/35 `lazynext.com` scans match the dogfood monitor's KV state exactly and on a 20.16 h
   machine cadence; 10 more are reserved-domain/fixture scans; 47 are burst-and-replay
   test payloads (5-in-0-seconds, 72% repeated fingerprints). That leaves 7.
2. **The arithmetic agrees.** A free scan has never asked for an email except at the
   3/day limit wall or the opt-in field. At a generous 5% scan→lead rate, 7 real scans
   predict 0 leads with **p = 0.70** — observing 0 is unremarkable. If all 132 had been real,
   0 leads would be a **1-in-870** event (p = 0.0012) — that would have been a genuine
   conversion catastrophe. The data fits exactly one hypothesis: almost nobody arrived.
3. **Recency.** Zero external scans since 2026-11-01. A conversion problem requires a
   stream to convert.
4. **The funnel metric itself is the artifact.** `scans_30d` overstates outside traffic by
   **18.9×** (132 reported vs 7 external). Anyone reading the funnel sees 132 → 1 and
   concludes "0.8% conversion, the funnel leaks" — when the true ratio is 7 → 0, i.e. "no
   sampling yet".

Also worth stating plainly: **a real conversion rate is currently unmeasurable end-to-end**
because Dodo is deliberately in test mode (founder decision, 2026-09-29) — no trial can
become a paying customer, and `trials_active: 0` / `subscriptions_active: 0` would read the
same whether the funnel leaked or not. Conversion tuning now would be tuning against noise.

### Recommendation — attack distribution first

1. **Fix the metric before acting on it (cheap, this week).** Add `scans_external_30d` to
   the funnel: count `report:*` records whose `url` host passes the same filter as
   `benchHost()` **and** is non-null (pasted-HTML excluded). Two lines in `billing.ts` plus
   the same list already fetched — it turns a misleading 132 into an honest 7 and makes
   every later funnel decision trustworthy. Do not "fix" this by changing `scans_30d`
   itself (it is a legitimate scan *volume* metric); add the second, provenance-aware field.
2. **Then push distribution, where the evidence says the gap is.** The product already has
   listings queued: directree edits awaiting review (~2026-12-06), mcp.so issue
   [#6529](https://github.com/chatmcp/mcpso/issues/6529), Smithery live, Hugging Face Space
   live, SaaSHub verified, AlternativeTo in the free queue. None of them are producing scans
   yet — 7 external in 30 days is the measurable outcome of the current distribution.
   Track `scans_external_30d` per week against those channels.
3. **Instrument provenance at the source (small, permanent).** In `runScan`, stamp the report
   with a coarse, privacy-safe origin: `src` (`web` | `mcp` | `a2a` | `widget` | `ci` |
   `monitor`) and a **salted hash of `cf-connecting-ip` + country**, never the raw IP. This
   audit cost hours of cadence-and-fingerprint forensics purely because `report:*` carries no
   origin; with `src`, the next audit is a `GROUP BY`.
4. **Do not touch conversion yet.** The one conversion-shaped oddity is real but secondary:
   `crm_leads` shows `0 lead` and `0 nurture` — the qualifier drains the seed into
   qualified/engaged/disqualified, so an inbound lead would land unqualified until a cycle
   runs. Worth a look *after* traffic exists, not before.

---

## 8. What could not be proven (stated honestly)

- **L1 — caller identity for the 7 external (and the 47 pasted) scans.** `report:*` stores no
  IP/UA, and the KV `rl:scan:*` quota keys expire in ~25 h, so only *today's* key survives.
  For the 7 external scans I can prove the host, the time, the viewport and the score — not
  the operator. `corpusiq.io` is a plausible outside user; it is labelled "external" on host,
  and "probably human" only on plausibility (2 scans 4 min apart, no `task_log` row, absent
  from CRM/contacts). A `task_log` row at 03:55:54Z (a marketing task) sits 6 min before it,
  which I could not tie to the scan — flagged rather than explained away.
- **L2 — provenance of the 47 pasted-HTML scans at the operator level.** Proven programmatic
  (same-second bursts, 16 fingerprints / 47 scans, 72% in 5 payloads) and proven not to be
  the repo's committed fixtures (signatures do not match a local run of our own scanner).
  Attributed to "ours" on the strength of every other attributable scan in the window being
  ours. If the founder knows of any outside party who was given pasted-HTML access in
  October, that bucket would move — nothing else in the data suggests one.
- **L3 — the pre-2026-10-05 tail.** `report:*` TTL is 30 days, so scans before 2026-10-05
  have expired and are unknowable. 132 is the current window, not cumulative. (D1
  `scan_stats` retains older rows and was used as the cumulative cross-check in §5.)
- **L4 — historical per-IP quota data.** `rl:scan:*` keys live ~25 h; a 30-day IP picture is
  unrecoverable without new instrumentation (R3).
- Never requested, never needed: an `lzk_` write key, D1 writes, KV writes, task creation,
  connector dispatch, or any email.

---

## 9. Reproduction (read-only)

```bash
# 1. funnel (authoritative scans_30d)
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "$CLOUDFLARE_API_URL/api/v1/billing/funnel"

# 2. every report key (route paginates internally via listAll)
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" -d '{"prefix":"report:"}' \
  "$CLOUDFLARE_API_URL/kv/list"

# 3. per-record provenance fields (url, ts, score, plan, rendered)
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" -d '{"key":"report:<id>"}' \
  "$CLOUDFLARE_API_URL/kv/get"

# 4. the monitor that explains 35 of them
#    (same call for key mon:support@lazynext.com:1w1fov0)

# 5. the CI canary that explains 33 of them
gh run list --repo Lazynext-AI/accessibility-checker --workflow self-scan \
  --limit 60 --json createdAt,event,conclusion

# 6. the cumulative corpus cross-check (SELECT only)
#    POST /query {"sql":"SELECT host, COUNT(*) n, MIN(created_at), MAX(created_at)
#                        FROM scan_stats GROUP BY host ORDER BY n DESC"}

# 7. the lead
#    POST /kv/list {"prefix":"lead:"}  -> 3 keys (1 entity) -> conn-sweep-probe@example.com
#    SELECT id, email, source, created_at FROM waitlist;  -> id 11, same address
#    SELECT source, subscribed, COUNT(*) FROM email_contacts GROUP BY source, subscribed;
```

`urllib` callers must set a real `User-Agent` — Cloudflare's bot rule answers a bare
`Python-urllib/x.y` with `403 error code: 1010` and an empty body, which reads like an app
auth failure (this bit no calls here because the UA was set, but it is the trap in this
codebase's ops notes).

---

_All figures above were read live on 2026-11-03. If a number needs re-verification, re-run the
query printed beside it; §9 lists each one._
