# Discovery Plan — why nobody finds the checker, and what to do about it

**Date:** 2026-11-05 (IST)
**Base:** `main` @ `8dc5c6e`
**Branch:** `feat/discovery-plan` (docs only — no product file, no deploy, no submission, no signup, nothing paid)
**Status:** read-only audit + ranked plan for founder review. **Nothing in this document has been submitted, registered, posted, emailed, or purchased.**

**Why this exists:** two cold-email campaigns (35 sends, 0 replies) and a proven distribution gap — only **7 of 139** scans in the last 30 days are external (§2). The founder redirected effort from outreach to discoverability. This document answers, with live evidence, *where a stranger could actually encounter this product today*, and what free work would change that.

**Constraints honoured:** every check below is a `GET`/read, a public search, or the free `/scan` endpoint used once to confirm the product still works. No account was signed into, no credential was used, no listing was created, no email or connector dispatched, no D1/KV write, no deploy, no code change. Secrets are never printed — only the *names* of env keys appear.

---

## 0. TL;DR

| Question | Answer |
|---|---|
| Is the site indexed? | **Barely — 3 URLs for the whole company domain.** Two of the three are the WordPress blog and its default "Hello world!" post. The apex homepage, `/pricing`, `/docs`, `/status`, `/changelog`, `/legal` do not appear at all. `/rules` — in the product sitemap — is not indexed either. |
| Distribution or conversion problem? | **Distribution (a).** 7 external scans in 30 days; `trials_active: 0`; 1 lead; 0 stars; 4 npm downloads last week; 0 of 119 entries in W3C's canonical tool list. |
| Highest-leverage single action | **Submit the tool to the W3C WAI Evaluation Tools List** (free, ~25 min, no ID/payment) — the one surface where the exact buyer already looks, and it sends clicks *directly*, bypassing the ranking problem entirely. |
| Biggest surprise | Google Search Console is **already verified** on this domain (two `google-site-verification` TXT records) and Google is **deliberately declining to index** pages it crawled — "Duplicate, Google chose different canonical than user" (GSC emails, 2026-10-22, in `docs/ops/inbox-audit-2026-11-04.md` §5). |

---

## 1. Current discoverability state

Method note: indexing was probed through the Firecrawl search MCP (a third-party web index, not a signed-in Google property) and **calibrated** against a competitor domain on the same day, so a thin result is a real signal rather than a tool artifact. Commands in the [appendix](#appendix--raw-evidence).

### 1.1 Index footprint — the decisive table

| Query | Result | Reading |
|---|---|---|
| `site:checker.lazynext.com` | **1 URL** — `https://checker.lazynext.com/` | The product has exactly **one** indexable page. `/rules`, which *is* in the sitemap, is not indexed. |
| `site:lazynext.com` | **3 URLs** — checker root, `blog.lazynext.com/`, `blog.lazynext.com/hello-world/` | The apex homepage is **absent from its own `site:` query**, while a WordPress placeholder post is present. |
| `site:marketing.lazynext.com` | **0 URLs** | Duplicate host exists but isn't indexed — corroborates the "Google picked a different canonical" notice. |
| `site:accessibilitychecker.org` (calibration) | **25 URLs** | Same tool, same day → the thin result above is real, not an index limitation. |
| `free WCAG accessibility checker scan website` | 15 results, **Lazynext absent** | We do not rank for the category. Owned by accessibilitychecker.org, accessiBe, AudioEye, UserWay, Skynet, W3C. |
| `Lazynext accessibility checker` (brand) | **#1 — `checker.lazynext.com/`** | Brand search works. This is the only query we win, and it requires already knowing the name. |

**Sitemap + robots — both present and correct:**

| Surface | State | Evidence |
|---|---|---|
| `lazynext.com/sitemap.xml` | 200, **6 URLs** (`/`, `/pricing`, `/docs`, `/status`, `/changelog`, `/legal`) | Declared in `robots.txt` line 133. Correctly formed. |
| `checker.lazynext.com/sitemap.xml` | 200, **2 URLs** (`/`, `/rules`) | Declared in that host's `robots.txt`. |
| `robots.txt` (both) | `User-agent: * / Allow: /` + `Content-Signal: search=yes`. 31 AI-training bots disallowed (GPTBot, ClaudeBot, KimiBot, CCBot …) | Search crawling explicitly allowed; only *training* is reserved. **Not** the cause of the problem. |
| Google Search Console | **Verified** — two `google-site-verification=` TXT records on the apex | GSC is live and emailing `support@lazynext.com`. |
| Bing | **Verified** — `BingSiteAuth.xml` served 200 with the expected token | Live. |
| IndexNow | **None found** | No key file, no `indexnow` reference anywhere in the repo. |

**GSC is not a missing-credential problem — it is a fixable site problem.** GSC emailed twice on 2026-10-22: *"New reasons prevent pages from being indexed on site lazynext.com"* / *"…pages in a sitemap from being indexed"*, both citing **"Duplicate, Google chose different canonical than user."** That duplicate mechanism is still live today:

| Duplicate surface | State |
|---|---|
| `marketing.lazynext.com` | Serves **byte-identical copies of all 6 apex pages** (MD5 match on `/`, `/pricing`, `/docs`, `/status`, `/changelog`, `/legal`). Canonical points to the apex, but Google is free to disagree — and its notice says it did. |
| `api.lazynext.com/`, `app.lazynext.com/`, `accessibility-checker.dry-hall-6a50.workers.dev/` | All 200, returning the JSON descriptor (not HTML) — weak duplicates, but three more hosts answering for the same product. |
| `www.lazynext.com` | 301 → apex. Correct. |
| `lazynext.com/index.html` | Serves the homepage at a second path (canonical correct). Minor. |

### 1.2 SEO fundamentals

Both sites are technically competent — better than the indexing numbers suggest. The gaps are specific, not structural.

| Element | `lazynext.com` | `checker.lazynext.com` | Gap |
|---|---|---|---|
| `<title>` | "Lazynext — The Autonomous AI Company OS" (43 ch) | "Accessibility Checker — WCAG scanner" (38 ch) | Apex title sells an **AI company OS**, not accessibility. A searcher looking for a WCAG tool has no reason to click "The Autonomous AI Company OS". |
| Meta description | "A company that builds itself. 12 agents, your infrastructure, your rules." | ~290 ch | Checker's is **well over the ~155–160 ch** that survives in a SERP — the useful half ("Free tier included; Pro $9/mo…") truncates. |
| `<h1>` | "A company that builds itself." | "Accessibility Checker" | Apex H1 contains **zero** accessibility keywords. |
| Canonical | ✅ self | ✅ self | — |
| OG tags | title, description, url, type, image (200, 40 KB) | title, description, url, type, image (200, 50 KB) | Apex has **no `twitter:image`**, no `og:site_name`. |
| JSON-LD | `Organization` + `WebSite` — **`sameAs: []`** | `WebApplication` + 3 `Offer`s + `provider` | Empty `sameAs` = no entity graph for Google/AI answer engines. Checker lacks `softwareVersion`, `featureList`, `sameAs`. |
| `llms.txt` | ✅ 200 | ✅ 200 | **Strength** — most peers lack this (market scan: only ARX ships one). |
| Accessibility statement | **404** (`/accessibility`, `/accessibility-statement`) | **404** | An accessibility product with no accessibility statement. Blocks a W3C listing field; it is the first thing an a11y buyer checks. |
| Demo / example report | — | `/report` **404**, `/example` 404, `/demo` 404 | No linkable sample report. A stranger cannot see an output without generating one. |

### 1.3 Does the product itself still work?

One free scan was run (the only write-ish action in this audit, well inside the public 3/day quota) to confirm the thing being marketed is real:

```
POST https://checker.lazynext.com/scan  {"url":"https://example.com"}
→ 200, score 85, rendered: true, 3 issues (wcag-1.3.1 ×2, wcag-2.4.1)
→ report: https://checker.lazynext.com/report/b61aaadb-…
```

The product works. **The problem is not the product** — worth stating plainly, because four weeks of zero external traffic invites the wrong conclusion.

### 1.4 Channel-by-channel presence

Ranked roughly by how likely an accessibility buyer is to pass through it.

| Channel | Present? | Evidence (2026-11-05) | Free & house-rule-safe? |
|---|---|---|---|
| **W3C WAI Evaluation Tools List** (canonical list, 119 tools) | ❌ **ABSENT** | No `lazynext` match in the list's data repo (`w3c/wai-evaluation-tools-list`, GitHub code search); 0 trace in the rendered list. | ✅ Free form, no ID, no payment. Publishes to a public GitHub PR. |
| **Chrome Web Store** | ❌ ABSENT | No extension exists. Highest-intent search box in the category. | ⚠️ $5 one-time dev fee → **payment, needs approval**. |
| **GitHub Marketplace (Action)** | ❌ **404** | `github.com/marketplace/actions/lazynext-accessibility-checker` → 404, yet `action.yml` is Marketplace-ready (`branding: {icon: check-circle, color: purple}`), tag `v1` exists, 1 release exists. | ✅ Free. Publish checkbox on the release. |
| **a11yproject.com resources** | ❌ ABSENT | 0 results for `site:a11yproject.com lazynext`. | ✅ Free (community PR). |
| **awesome-a11y lists** | ❌ ABSENT | `gh search code lazynext --repo brunopulis/awesome-a11y` → 0. | ✅ Free PR. |
| **WebAIM** | ❌ ABSENT | WebAIM publishes its own tools; no third-party directory to be in. | ➖ Not applicable — don't chase it. |
| **npm** | ✅ PRESENT, ❌ invisible | `@lazynext/accessibility-checker@1.0.0`: **262 downloads/30 d but only 4 in the last 7 days** (the 262 is the publish spike). Metadata has **no `keywords`, no `homepage`, no `repository`** — npm search cannot surface it and the page has no back-link. | ⚠️ Editing metadata requires a `1.0.1` publish; house rule says *do not restore npm login just to edit the package* → **founder decision**. |
| **GitHub repo** | ✅ PRESENT, 0 traction | 0 stars / 0 forks / 0 watchers / 0 open issues; topics set (`a11y`, `wcag`, `accessibility-testing`). | ✅ Free (you can't ethically buy stars). |
| **MCP directories** | ✅ **3 of 4 free ones live** | Smithery **live** (`smithery.ai/servers/lazynext/accessibility-checker`), Glama **live** (`com.lazynext.api`, `com.lazynext`), **odel.app live** (auto-ingested from README, 4 tools, checked 30 Oct 2026). | ✅ Already done — **stop adding more**. |
| **mcp.so** | ⏳ PENDING | Issue [#6529](https://github.com/chatmcp/mcpso/issues/6529) **open, 0 comments, opened 2026-11-01**. Only paid ($39) path on their form. | ✅ Free issue route; do not pay. |
| **apis.io** | ⏳ PENDING | Submission accepted 2026-11-03; `/api/v1/search?q=lazynext` still returns `{apis:0, providers:0}`. Hand-reviewed, batched into their next build. | ✅ Free; nothing to do but wait. |
| **directree** | ✅ **LIVE** | `directree.io/tool/accessibility-checker` → 200 (308 → `www.`), title "Accessibility Checker – directree". Owner edits pending ~35-day review, due ~2026-12-06. | ✅ Free; do not pay $19/$49. |
| **SaaSHub** | ✅ LIVE | Comparison page `saashub.com/compare-lazynext-accessibility-checker-vs-accessibe` appears in brand search. | ✅ Free. |
| **AlternativeTo** | ⏳ PENDING | Still "waiting to be reviewed" (last checked 2026-10-22). | ✅ Free; do not pay $5/$15. |
| **Product Hunt** | ❌ ABSENT (profile only) | `producthunt.com/@lazynext` exists; **no launch ever**. | ✅ Free (but one-shot — §3.12). |
| **Hacker News** | ❌ ABSENT | Algolia index: **0 submissions** for Lazynext. Comparable: "Show HN: Free WCAG accessibility checker – no signup" scored **3 points** on 2026-09-24 — the realistic ceiling for an unknown brand. | ✅ Free (once). |
| **Reddit (r/accessibility, r/webdev)** | ❌ ABSENT | No Lazynext threads in prior audits; the JSON API returned 429 to this audit. | ✅ Free, but self-promo rules → answer-in-thread only. |
| **dev.to** | ❌ ABSENT | `/lazynext` → **404** still. | ⚠️ Account quarantined; parked. |
| **Our own blog** | ✅ LIVE, harmful | `blog.lazynext.com` 200 but **TTFB 20.2 s** (cold-start container), containing exactly two pages: `hello-world` (indexed; reads *"Hello world! Welcome to WordPress… this is your first post. Edit or delete it"*) and `sample-page`. | ✅ Free to `noindex`/delete. |

---
## 2. The diagnosis: (a) nobody can find it

**Answer: (a).** With two qualifications stated up front, because the evidence should not be over-claimed.

### 2.1 The decisive numbers

| Metric | Value | Source |
|---|---|---|
| Scans, last 30 d | **139** | `GET /api/v1/billing/funnel` (live, read-only, 2026-11-05) |
| **External** scans, last 30 d | **7** (5.0 %) | same — `scans_external_30d: 7` |
| Leads / waitlist / active trials / active subs | **1 / 1 / 0 / 0** | same |
| Indexed URLs, entire company domain | **3** (1 product page, 1 blog index, 1 WordPress placeholder) | `site:` probes §1.1 |
| Indexed URLs, product host | **1** | `site:checker.lazynext.com` |
| Present in W3C's 119-tool canonical list | **No** | §1.4 |
| GitHub stars / npm downloads last week | **0 / 4** | GitHub API, npm downloads API |
| Rank for a category query | **absent from top 15** | §1.1 |
| Rank for the brand query | **#1** | §1.1 |

### 2.2 Why that is (a) and not (b)

The distinction between (a) "can't find it" and (b) "found it, didn't try it" hinges on **impressions**. That number is the one input I could not obtain: GSC is verified on the domain, but **there is no OAuth token or service-account credential in `.env`** (only `GOOGLE_APP_PASSWORD`, which is SMTP for the support mailbox), and I was instructed not to sign in. **Impressions are therefore unreadable here, and (b) cannot be positively excluded.**

But (b) cannot be the *binding* constraint, for four independent reasons that don't need impressions:

1. **Only one product URL is eligible to rank at all.** A page that is not indexed cannot generate an impression, so "found it but didn't try" is arithmetically impossible for the six apex pages Google declined to index — including the homepage that would carry any category traffic.
2. **We are absent at the two evaluation moments that precede a scan.** Nobody arrives at an accessibility tool by accident: they arrive via a list (W3C's), a store (Chrome), an article, or a thread. We are in **none** of them (§1.4).
3. **The one conversion-adjacent signal isn't a conversion failure.** 7 external scans produced 1 lead and 0 trials. On n=7, at a 3-scan free quota, that is indistinguishable from noise — far below the volume where a funnel diagnosis means anything. A funnel analysis on n=7 is not a funnel analysis.
4. **The product passes a live smoke test** (§1.3) and the report page is genuinely good. There is no evidence of a "try and bounce" product defect.

**Verdict: fix distribution first.** Re-run this diagnosis in GSC once impressions are readable — if impressions arrive and scans still don't, *then* it is (b), and the answer changes to the landing page, not to more listings.

### 2.3 The shape of the problem (worth naming precisely)

It is not simply "we are invisible". It is **three separate gates**:

- **Gate 1 — indexation.** Google crawled the site and chose to index almost none of it, because the same six pages are served on two hosts (`lazynext.com` and `marketing.lazynext.com`, byte-identical) and Google picked a canonical we disagree with. Everything organic is downstream of this.
- **Gate 2 — category relevance.** Even once indexed, the apex is titled and headed as an "Autonomous AI Company OS". Nothing on the primary domain signals "WCAG checker" to a crawler or to a human scanning a SERP. The product lives on a subdomain with one page.
- **Gate 3 — channel absence.** Where a11y buyers actually look (W3C list, Chrome store, Action Marketplace, curated awesome-lists), the product is in **zero** of them. This gate is independent of Google and is bypassable today.

---

## 3. Ranked action list

Ranked by expected impact per unit of effort. **Free** = $0 and no paid placement. **Approval** = the founder must sign off (public company voice, personal sign-in, or a payment).

| # | Action | Impact | Effort | Free | Approval | Blockers |
|---|---|---|---|---|---|---|
| 1 | Submit to W3C WAI Evaluation Tools List | **Very high** | ~25 min | ✅ | ⚠️ yes (publishes company details + `support@` in a public PR) | Needs the 350-char description + accurate capability ticks |
| 2 | Publish an accessibility statement | **High** | ~1–2 h | ✅ | ⚠️ yes (public conformance claim) | Fills an optional W3C field; removes a credibility landmine |
| 3 | Repair indexation (GSC + duplicate host) | **Very high** | ~30 min founder + 1 small deploy | ✅ | ⚠️ yes (Google sign-in; `_redirects` change) | The gate for every organic channel |
| 4 | Publish the GitHub Action to Marketplace | **Medium-high** | ~15 min | ✅ | ⚠️ yes (repo release) | None — `action.yml` is ready |
| 5 | `noindex` / remove the WordPress placeholder blog | **Medium** | ~10 min | ✅ | ⚠️ yes | Removes a trust-destroying SERP entry |
| 6 | 75 programmatic rule pages (`/rules/wcag-2-4-13…`) | **High (compounding)** | 1–2 days eng | ✅ | ⚠️ yes (product code + deploy) | Needs #3 first to be worth anything |
| 7 | Make `/rules` indexable + internally linked | **Medium** | ~30 min | ✅ | ⚠️ yes (deploy) | Cheap subset of #6 |
| 8 | `sameAs` + title/meta cleanup | **Low-medium** | ~30 min | ✅ | ⚠️ yes (deploy) | None |
| 9 | npm metadata (`keywords`/`homepage`/`repository`) | **Low** | ~10 min | ✅ | ⚠️ yes (conflicts with the "don't restore npm login" house rule — needs an explicit override) | Requires a `1.0.1` publish |
| 10 | Answer live r/accessibility threads (affiliation disclosed) | **Medium (spiky)** | 20 min/thread | ✅ | ⚠️ yes (public voice) | Not automatable; per-thread judgement |
| 11 | Chrome Web Store extension | **Medium-high** | 1–2 days eng | ❌ **$5** fee | ⚠️ payment | Store review; the real long game |
| 12 | Show HN / Product Hunt launch | **Unknown — do not fire yet** | 2 h prep | ✅ | ⚠️ yes | **Not ready** — see §3.12 |

### 3.1 — Submit to the W3C WAI Evaluation Tools List *(do this first)*

**What.** The W3C Web Accessibility Initiative maintains the canonical [Web Accessibility Evaluation Tools List](https://www.w3.org/WAI/test-evaluate/tools/list/) — **119 tools**, filterable by purpose, standard, licence, scope and tool type. It is where accessibility professionals, procurement teams and agencies go to answer "what should we scan with". It is also one of the highest-authority pages LLM answer engines cite for "accessibility tools".

**Where.** `https://www.w3.org/WAI/test-evaluate/tools/submit-a-tool/` — a 5-step form. Submissions are published as PRs to `github.com/w3c/wai-evaluation-tools-list`.

**Why it matters most.** It is the only channel in this document that sends a *click* rather than requiring a ranking. A visitor from that page lands on `checker.lazynext.com` directly — no Google, no impressions, no domain authority needed. It is permanent and free.

**Effort.** ~25 min, one sitting. **Free.** Yes — no fee, no ID, no selfie, no Stripe. It asks for tool name, URL, vendor/organisation, contact email, release date, and feature ticks. Optional: accessibility-statement URL and ACT-rules URL.

**Approval.** Yes — the vendor name and `support@lazynext.com` are published in a public GitHub PR (the form states the email never appears in the tool list itself, only in the PR).

**Accuracy notes for whoever fills it in** — the form's own criteria punish over-claiming, and a corrected or rejected listing is worse than none:

- Tool name `Lazynext Accessibility Checker`; URL `https://checker.lazynext.com/`
- Vendor `UNITED GLOBAL VENTURES PRIVATE LIMITED` (trading as Lazynext)
- Release date: the first public release (`v1` tag, 2026-10-01) — do not invent one
- **Licence: `Limited free functionality`** — NOT "Free". 3 scans/day free, Pro $9/mo with a card-up-front trial. The list distinguishes these; the wrong tick is a credibility bug.
- Purpose: `Automated testing` **only**. Do **not** tick "manual testing" or "simulated user experience" — we automate keyboard/contrast probing; we do not run human testers.
- Product evaluated: `Website`. File types: `HTML / XHTML`, `CSS`. **Do not tick PDF/EPUB/Office** — we do not scan them.
- Scope: `Single page/screen` + `Entire website / product`
- Standards: `WCAG 2.2` + `WCAG 2.1`. **Do not tick 2.0** unless `/rules` genuinely maps to it (it reports 74 WCAG criteria + 1 best-practice check).
- Assists by: `Generating reports of evaluation results` + `Creating an accessibility score`
- Type of tool: `Online tool` + `Server-side integration` + `Command-line / CI` (the REST API, MCP server and GitHub Action are all real)
- Language: English
- Description ≤350 characters, no superlatives, lead with the differentiator (rendered page + real Tab-trace, not static markup)

### 3.2 — Publish an accessibility statement

**What.** A real `/accessibility` page: conformance target, known limitations, contact route for barriers, date.

**Where.** `lazynext.com/accessibility`, linked from the footer. (`/accessibility` and `/accessibility-statement` both 404 today.)

**Why.** Three reasons at once: (i) it is an optional-but-weighted field in the W3C submission and a common reason a listing looks unfinished; (ii) it is the *first* thing an accessibility buyer checks on a tool vendor, and its absence reads as "this vendor doesn't use their own product"; (iii) we can generate honest input by scanning ourselves — we already dogfood (`license:support@lazynext.com = pro`), and a published score with a remediation note is stronger proof than a badge.

**Effort.** 1–2 h. **Free.** **Approval:** yes — it is a public conformance claim. Do **not** claim full AA conformance: dogfood has found real issues on our own site before (the `#6D28D9` contrast fix, the cookie banner tripping 2.4.11). An honest statement with a known-issues list is both compliant in spirit and *more* persuasive.

### 3.3 — Repair indexation (GSC + duplicate host)

**What.** Three sub-steps, in order:

1. **Consolidate the duplicate host.** `marketing.lazynext.com` serves byte-identical copies of all 6 apex pages (verified). Make it `301` to the apex (a `_redirects` change in `marketing/public/`, or unbind the host), so exactly one URL exists per page.
2. **GSC: submit both sitemaps** (site `lazynext.com`; add `checker.lazynext.com` as a URL-prefix property if it isn't already covered), then **URL Inspection → Request indexing** for the 8 real pages: 6 apex + `checker.lazynext.com/` + `checker.lazynext.com/rules`.
3. **Read the coverage report** and confirm the "Duplicate, chose different canonical" exclusion class stops growing.

**Why.** This is Gate 1. GSC *already told us* pages are being excluded for a canonical conflict on 2026-10-22, and the conflicting duplicate still exists. Nothing else here compounds until this is fixed. Request-indexing typically resolves in days, not weeks.

**Effort.** ~30 min of founder time (Google sign-in can't be delegated — no OAuth credential exists; I did not attempt a login) + one small deploy for the redirect. **Free.** **Approval:** yes. **Blocker:** this one action **cannot** be done autonomously.

### 3.4 — Publish the GitHub Action to Marketplace

**What.** `action.yml` is already Marketplace-shaped (`name`, `description`, `branding: {icon: check-circle, color: purple}`), and tag `v1` + 1 release exist — but `github.com/marketplace/actions/lazynext-accessibility-checker` **404s**. Publishing is the "Publish this Action to the GitHub Marketplace" checkbox on a release.

**Where.** Product repo → Releases → create/edit → tick Marketplace → categories (Testing & QA, Code quality).

**Why.** Free, permanent, keyword-indexed inside GitHub — a developer searching "accessibility" in Marketplace currently cannot find us, even though the Action has existed since October.

**Effort.** ~15 min. **Free.** **Approval:** yes (repo release flow).

### 3.5 — Kill or fill the blog

**What.** `blog.lazynext.com/hello-world/` is **one of only three indexed URLs for the entire company domain**, rendering *"Hello world! Welcome to WordPress… this is your first post. Edit or delete it, then start writing."* Plus `sample-page`. The blog also has a **20.2 s TTFB** (cold-start container) — worse than useless for a crawler with a crawl budget.

**Where.** `ops/wordpress/` — either delete both default pages and `noindex` the blog until ≥3 real posts exist, or start the container and publish three genuine posts.

**Why.** Right now the most crawlable asset on the domain tells a visitor we never finished setup — a trust leak in the exact SERP where we *do* appear.

**Effort.** ~10 min (`noindex`/delete). **Free.** **Approval:** yes.

### 3.6 — 75 programmatic rule pages

**What.** One page per rule in the manifest (`/rules/wcag-2-4-13-focus-appearance`): what the criterion requires, what commonly fails, how *we* detect it (rendered vs static), a minimal failing example, and a "scan your site" CTA. The manifest already holds every field needed (`/rules` returns 75 entries with id, level, WCAG version, detection path).

**Why.** The only channel here that compounds. "wcag 2.4.13", "focus appearance test", "section 508 1194.22 mapping" are queries with **thin, low-quality competition** — nothing like the head term "accessibility checker", owned by five funded vendors. 75 pages also mean 75 internal links and 75 specific reasons for another site to link to us. It converts our genuine strength (74 criteria + 1 BP vs axe's 28) into discoverable surface area, which no competitor listing can copy cheaply.

**Effort.** 1–2 days eng (generate from the manifest, static pages, extend `sitemap.xml`). **Free.** **Approval:** yes (product code + deploy). **Respect the protected-file lock** — `worker.js`, `index.html`, `src/scanner.js`, `package.json`, `test/scanner.test.mjs` are off-limits; new files only.

**Sequencing.** Only worth doing *after* #3 — publishing 75 pages to a domain Google is refusing to index yields 75 more excluded URLs.

### 3.7 — Make `/rules` indexable and linked

**What.** `/rules` is in the checker sitemap and returns 200, but is **not indexed**, and nothing prominent on the apex links to it.

**Why.** The cheapest version of #6: one already-built page that proves coverage depth (75 rules with citations) and is a natural link target. **Effort** ~30 min. **Free.** **Approval:** yes.

### 3.8 — `sameAs` + title/meta cleanup

**What.**
- `Organization.sameAs` is `[]`. Add GitHub, X (`@Lazynextai`), npm, SaaSHub, directree, Product Hunt.
- Trim the checker's ~290-char meta description to ≤155 ch, front-loading "Scan any website for WCAG 2.2 issues — free".
- Add `twitter:image` to the apex; add `og:site_name` to both.
- Consider naming the checker in the apex `<title>` (e.g. "Lazynext — autonomous company OS + free WCAG checker"). Gate 2 lives here.

**Effort.** ~30 min. **Free.** **Approval:** yes (deploy). **Impact:** low-medium — improves entity recognition and click-through; does not create demand.

### 3.9 — npm metadata

`@lazynext/accessibility-checker@1.0.0` has **no `keywords`, no `homepage`, no `repository`** — npm's own search cannot surface it, and anyone landing on the package page has no link back to the site or repo. Fixing it requires a `1.0.1` publish, which **conflicts with the standing house rule** ("do not restore npm login just to add a README"). Listed for completeness, ranked low: needs an explicit founder override, and is worth ~10 min only if npm is a channel we intend to use (4 downloads/week says it isn't, yet).

### 3.10 — Answer live threads (not link-drops)

r/accessibility and r/webdev get recurring "what's a good free WCAG checker?" threads — the category search surfaced one on the first page of results. Answering *as a person, with affiliation disclosed, recommending the right tool for that specific question* is legitimate and converts. Dropping a link as a post is not, and will get the domain flagged. **Effort** 20 min/thread, **free**, **approval** yes (public company voice). **Not automatable — do not let the fleet post here.**

### 3.11 — Chrome Web Store extension

The highest-intent search box in this category, and `widget.js` (Shadow-DOM embed) is a starting point. Blocked on a **$5 one-time developer registration fee** → a payment, so it needs explicit approval; plus ~1–2 days eng and store review. Worth doing, but a Q1 item, not this week.

### 3.12 — Show HN / Product Hunt: **not yet**

I judge the product **not ready to launch**, and firing now would spend one-shot channels for ~0 return. Readiness gaps:

| Readiness criterion | State |
|---|---|
| A stranger can see the output without doing work | ❌ no example/sample report page (`/report` 404, `/example` 404) |
| The site passes its own audit, publicly | ❌ no accessibility statement; dogfood has found real issues historically |
| Social proof exists | ❌ 0 stars, 0 forks, 0 external users |
| A "no signup, free" path exists | ✅ 3 scans/day, no account — genuinely launchable |
| Something a HN reader can't get elsewhere | ✅ yes: 74 WCAG criteria + real Tab-trace + MCP/A2A + OpenAPI, vs axe's 28 criteria and peers all publishing no contract |
| A clear one-line pitch | ⚠️ no — the apex pitch is about agents, not accessibility |

**To make it ready:** (1) publish 2–3 example report permalinks from well-known public-sector or high-traffic sites, linked from the homepage; (2) publish the accessibility statement; (3) accumulate ~20+ genuine GitHub stars by shipping the Action to Marketplace and being listed in the W3C list; (4) write the one-line pitch that a stranger repeats correctly. That is roughly **2–4 weeks of the work below**, and then a Show HN is worth firing.

---
## 4. What NOT to do

Each of these looks like marketing and will produce nothing here — or make things worse.

| Don't | Why not, with the number |
|---|---|
| **Send more cold email to the same list** | 35 sends → **0 replies**. A 0 % reply rate on a 35-contact sample is not a copy problem, it is a list problem: this audience never raised its hand. Doubling the volume to 70 sends buys 70 more ignored messages and more deliverability damage to a domain that is only now DKIM-aligned. |
| **Pay to skip a directory queue** | mcp.so $39, directree Fast Lane $19 / Plus $49, AlternativeTo $5 / $15, SaaSHub Priority+ $75. Every one of them sells a *review speed-up*, not distribution. Total $138–$178 to appear on pages with no measurable referral traffic — and three of the four listings are **already live or pending for free**. |
| **Start paid ads** | No budget, and worse: paid traffic lands on a site with **1 indexed page**. You'd be renting attention you can't retain. Revisit only after indexation is fixed and a report-example page exists. |
| **Buy stars, reviews, or "featured" placement** | Both a platform-rules violation and a reputational trap for a product whose entire pitch is accessibility integrity. A 0-star repo becoming a 500-star repo overnight is the loudest possible signal that something is fake. |
| **Chase G2 / Capterra / Trustpilot vendor profiles** | G2 and Capterra have **no listing to claim** (searches return unrelated `*Next` products), and vendor profiles are paid. The category SERP there is owned by accessiBe / UserWay / AudioEye with review-mill armies. |
| **Add more MCP directories** | We're already on **3 of the 4 free ones** (Smithery, Glama, odel.app), with mcp.so pending. Marginal returns have collapsed to zero; a 5th MCP listing is not how a stranger finds an accessibility tool. |
| **Publish AI-generated blog posts to `blog.lazynext.com`** | **20.2 s TTFB** and a WordPress container that sleeps. Content at that latency is a net negative for crawl budget, and thin AI posts on a brand-new domain are the fastest route to a "scaled content abuse" classification. Fix latency and write fewer, better pages — or `noindex` it. |
| **Launch on Show HN / Product Hunt this week** | §3.12 — no example report, no accessibility statement, 0 stars. Both are one-shot; a 3-point HN post (the observed ceiling for comparable unknown-brand a11y launches) burns the channel permanently. |
| **Post links in r/accessibility as a submission** | Self-promo rules; a brand-new domain dropping links gets removed and may get the domain flagged, which is unrecoverable. Answer threads instead (§3.10). |
| **Re-run the same `site:` audit next week and call it progress** | Measuring is not doing. The GSC impressions number is the only metric worth re-reading, and only after #3. |

---

## 5. The single highest-leverage action

> **Submit the tool to the W3C Web Accessibility Evaluation Tools List** (§3.1), with the accessibility statement (§3.2) published in the same sitting.

**Why this one, and not the indexation fix:**

- **It does not depend on Google.** Every other organic action in this plan routes through ranking, and a domain with 3 indexed URLs and no authority will not rank for an accessibility category query inside a week. The W3C list is **a direct referral**: a person browsing 119 tools clicks the entry and lands on `checker.lazynext.com`. That click needs no impression, no ranking, no domain authority.
- **It is where the buyer already is.** It is the page accessibility professionals, agencies and procurement teams consult when choosing a scanning tool. It is also one of the highest-authority sources LLM answer engines cite for "what accessibility tools exist" — which matters more every month, and where our `llms.txt` + OpenAPI + MCP surface already make us unusually legible.
- **It is permanent and free.** ~25 minutes, no fee, no ID, no selfie, no Stripe — fully inside the house rules. Unlike a launch, it cannot be "wasted".
- **It forces the one artifact we're missing.** Filling the form honestly requires an accessibility statement and an accurate capability list, so it produces the credibility page we should have had all along.
- **It is a citation Google can see.** A link from `w3.org` to `checker.lazynext.com` is exactly the kind of editorial signal that helps Gate 1 and Gate 2 at the same time.

**Parallel, same week (does not compete with it):** #3 indexation repair — it needs founder sign-in and unblocks everything organic — and #4, the Action Marketplace publish, which is 15 minutes of pure free surface. Ranked below #1 because neither sends a stranger *next week*; both pay off from week 3 onward.

---

## 6. Suggested sequencing

| When | Action | Owner |
|---|---|---|
| Today | Write + publish the accessibility statement (#2) | eng, founder approves |
| Today | W3C list submission (#1) — needs #2's URL for the optional field | founder (or eng with approval) |
| This week | GSC sitemap submit + request indexing ×8; 301 `marketing.` → apex (#3) | **founder (sign-in) + eng (deploy)** |
| This week | Publish the Action to Marketplace (#4) | founder |
| This week | `noindex`/delete the WP placeholders (#5) | eng, founder approves |
| Next week | `/rules` linked + indexed (#7); `sameAs`/meta cleanup (#8) | eng |
| Weeks 2–4 | 75 rule pages (#6), then re-check `site:` and GSC impressions | eng |
| Month 2 | Example report pages, ~20 stars, then Show HN (#12) | founder |
| Q1 | Chrome extension (#11, $5 fee → approval) | eng |

**Re-audit trigger:** after #3 lands, re-read GSC impressions. If impressions > 0 and external scans stay flat, the diagnosis flips to **(b)** and the next document is a landing-page/CTA audit — not another listing.

---

## Appendix — raw evidence

All run 2026-11-05 between 03:15 and 03:45 IST. Read-only.

```bash
# index footprint (Firecrawl search MCP, calibrated same day)
site:checker.lazynext.com        → 1 URL
site:lazynext.com                → 3 URLs (checker /, blog /, blog /hello-world/)
site:marketing.lazynext.com      → 0 URLs
site:accessibilitychecker.org    → 25 URLs          # calibration
"free WCAG accessibility checker scan website" → 15 results, Lazynext absent
"Lazynext accessibility checker" → #1 checker.lazynext.com
site:a11yproject.com lazynext    → 0 results

# sitemaps + robots
curl https://lazynext.com/sitemap.xml            # 200, 6 <loc>
curl https://checker.lazynext.com/sitemap.xml    # 200, 2 <loc>
curl https://lazynext.com/robots.txt | grep -i sitemap   # line 133 declaration
curl https://checker.lazynext.com/robots.txt     # Allow: /, Sitemap declared

# verification
dig +short TXT lazynext.com  # 2× google-site-verification=…, brevo-code, MCPv1
curl https://lazynext.com/BingSiteAuth.xml       # 200, expected <user> token

# duplicate hosts (MD5 of body, all 6 paths)
lazynext.com/{,'pricing','docs','status','changelog','legal'}
marketing.lazynext.com/{same}   → identical for all six
curl -I https://www.lazynext.com/   → 301 → https://lazynext.com/

# SEO fundamentals
curl https://lazynext.com/ | grep -E '<title>|canonical|og:|twitter:|ld\+json'
curl https://checker.lazynext.com/ | grep -E '<title>|canonical|og:|twitter:|ld\+json'
# accessibility statement probes
/accessibility /accessibility-statement → 404 on both hosts
# demo probes
/report /example /demo /report/demo → 404 (Product worker; /rules 200)

# product smoke test (one free scan)
POST https://checker.lazynext.com/scan {"url":"https://example.com"}
→ 200 {"score":85,"rendered":true,"issues":[3],"report":"…/report/b61aaadb-…"}

# channel presence
gh api repos/lazynextai/accessibility-checker --jq '{stars,forks,watchers,topics}'
→ 0 stars, 0 forks, 0 watchers, 6 topics
gh api repos/lazynextai/accessibility-checker/tags        # v1 exists
gh api repos/lazynextai/accessibility-checker/releases    # 1
curl -o /dev/null -w '%{http_code}' \
  https://github.com/marketplace/actions/lazynext-accessibility-checker   # 404
curl https://raw.githubusercontent.com/lazynextai/accessibility-checker/main/action.yml
  # name/description/branding present → Marketplace-ready
gh search code lazynext --repo brunopulis/awesome-a11y     # 0 hits
gh search code lazynext --repo w3c/wai-evaluation-tools-list # 0 hits
gh api repos/chatmcp/mcpso/issues/6529 --jq '{state,comments}'
  # {"state":"open","comments":0}
curl 'https://apis.io/api/v1/search?q=lazynext'
  # {"apis":{"total":0},"providers":{"total":0}}

# package + registry usage
curl https://api.npmjs.org/downloads/point/last-month/@lazynext%2Faccessibility-checker
  # 262
curl https://api.npmjs.org/downloads/point/last-week/@lazynext%2Faccessibility-checker
  # 4
curl https://registry.npmjs.org/@lazynext%2Faccessibility-checker/latest
  # keywords: None, homepage: None, repository: None

# live funnel (platform, internal bearer, read-only GET)
GET /api/v1/billing/funnel
  # scans_30d 139, scans_external_30d 7, leads 1, waitlist 1,
  # trials_active 0, subscriptions_active 0, licenses_pro 1 (dogfood)
```

**Tool limitations, stated honestly:**

- **No GSC read.** GSC is verified (§1.1) but no OAuth token or service-account credential exists in `.env`, and signing in was out of scope. **Impressions, average position and the coverage report are unverified** — that is the single most valuable unread number in this document.
- **Search results are third-party.** Indexing was read through the Firecrawl search MCP, not Google directly, and calibrated against a competitor on the same day. A `site:` result of 1 or 3 is consistent with Google, but not proof of Google's exact index size.
- **Reddit's JSON API returned 429** to this audit, so "absent from r/accessibility" rests on prior audits in `docs/`, not a fresh query.
- **W3C list membership** was checked via GitHub code search of the list's data repo (0 hits), not by reading the rendered 119-row list (JS-rendered). Treated as absent; confirm by searching the published list for "Lazynext" before submitting, so we don't submit a duplicate.


