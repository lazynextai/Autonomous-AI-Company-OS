# Ops watch calendar

**Status:** authoritative future-action table. Every row is a date-driven watch item —
something that changes state on its own and will cost money, access, or standing if nobody
looks at it. Newest verification is recorded at the bottom.

Rules that apply to every row:

- A watch item is **read-only** until a row says otherwise. Checking an inbox, a dashboard, or
  a public page never authorizes a submission, sign-in, payment, or cancellation.
- Anything that needs a **sign-in code, personal ID, or a card** waits for an explicit founder
  decision. Do not loop an OTP flow to "just check" a page.
- When a provider asks for a decision, one founder sentence closes it. Record the sentence
  here instead of re-deriving the question next month.

## Future actions

| # | Item | Key date | What to do | Blocked on |
|---|---|---|---|---|
| 1 | **Microsoft Partner Center — seller `96466040`, verification attempt 3 of 3** | **FOLLOW-UP SENT 2026-11-06 02:34 IST** (message `1a1ad871aba72449`, to supportmail@techsupport.microsoft.com, subject `Re: Partner Center account verification rejected … TrackingID#2610070060003196`). **Next: wait for their reply.** **Reply check 2026-11-06 05:00 IST: still silent** — no mail from either Microsoft address, follow-up thread still has 1 message (see verification log). Gmail filed it as a new thread (not inside the case thread) despite In-Reply-To/References — the TrackingID in the subject keeps it matchable; do NOT re-send to force threading. | No action due — reply arrives on its own. Never a browser/code-flow retry; the MSA `prompt=login` + `acr_values=mfa` chain demands a fresh code at every hop and cannot be read unattended. | Founder pre-authorized the email-only follow-up (sent) |
| 2 | **Cloudflare monthly renewal** | ~**2026-12-01** (last invoice `IN-86694892`, **$5.53 Paid**) | Open the Stripe invoice link in the "Confirm your payment to Cloudflare" mail. A **Visa Secure bank-OTP popup** can time out on the first confirm, which leaves a scary "overdue balance" / "payment failed" alert — both are pre-settlement noise. Re-click **Pay** on the invoice page; that clears it. Treat the later "[Confirmation] Purchase confirmed" mail as authoritative. | Nothing — re-click is enough. Only escalate if a re-click also fails |
| 3 | **directree — owner-edit review** | ~**2026-12-06** (review scheduled 35 days from 2026-11-01) | Check `directree.io/tool/accessibility-checker` for approval. On approval the do-follow badge activates. Do **not** re-edit the listing and do **not** pay Fast Lane ($19) / Plus ($49) to skip the review. Badge is deliberately not embedded on our site (marketing CSP would block it). | Their review queue |
| 4 | **M365 Business Basic trial ends** | **2026-11-26** (confirmed in-thread by Microsoft's own expiry email during the full-body read 2026-11-04; earlier calendar said 27th — use 26th) | **No action.** Auto-renew was cancelled 2026-10-27, so the tenant (`lazynext.onmicrosoft.com`) simply lapses. Teams delivery is webhook-based via Power Automate, so confirm after the lapse that Teams dispatch still returns 202 if the tenant survives in read-only mode. | Nothing |
| 4b | **Meta One — auto-enable of business-portfolio delegation** | **2026-11-04 — REVIEWED, NO ACTION** | Full body read 2026-11-04: this is a **permission**, not a charge. It lets anyone who already has access to the `Lazynext` business portfolio *buy/manage a Meta One subscription* without full portfolio access. It does **not** subscribe or bill us. **Decision: no action** — only the founder has portfolio access, and Lazynext does not use Meta One (Facebook/Instagram/Threads go through Ayrshare). If a contractor/agency is ever given portfolio access, revisit and disable via Business info → Meta Business Suite. Do not sign into Meta with personal creds to "check". | None — reviewed |
| 5 | **Power Automate Premium trial auto-converts to paid** | ~**2027-01-28** (90-day trial started 2026-10-30). **Start watching 2027-01-01** | Decide cancel vs keep before conversion. The Request trigger is Premium, so cancelling removes the Teams webhook path — plan a replacement (tenant Teams Webhook V2 cannot be anonymous) before pulling it. Cancellation itself needs the founder's **email code** at the final step. | Founder decision + founder email code |
| 6 | **Dodo Payments — test mode** | **CLOSED 2026-11-04 — founder: "stay"** | Test mode is **permanent**. No KYC, no live flip, no live product/webhook/WELCOME20 rebuild, no re-proposing. This question is closed forever; do not reopen it. | Founder answered (one word) |
| 7 | **WHOIS privacy on `lazynext.com` — verify + confirm Private** | Immediately after the Microsoft verdict (row 1); regardless by ~2026-11-10 | Was **flipped to Public 2026-10-30** (founder-approved) so Microsoft's vetting could read the registrant block. **LIVE CHECK 2026-11-04: the registrant block is NOT currently visible** — registry RDAP + Verisign GRS WHOIS show only the registrar (Spaceship, Inc.), zero matches for UNITED GLOBAL/BALAJI/registrant. So privacy appears already restored (by whom is unrecorded) **or** registrar-gated. **Re-checked 2026-11-06: Verisign RDAP still returns registrar only** (Spaceship, IANA 3862) with zero registrant matches — public exposure remains closed. Action: open the Spaceship dashboard and CONFIRM the privacy toggle is Private; if it is Public, flip it back. Do not trust this table's history — trust the live lookup. | Microsoft verdict; else timeout ~2026-11-10. Spaceship login needed to inspect the toggle |
| 8 | **Cloudflare Observability volume pricing** | **2026-12-01** | Cloudflare moved observability to volume pricing; Workers Paid auto-gets a Paid Observability subscription (50 GB / 10 GB-mo included). **No email reply needed** — review usage before Dec 1 (found in inbox audit 2026-11-04). Decide whether the included allowance is enough; do not enable a paid tier without founder approval. | Founder awareness — included allowance likely enough |

## Secondary watches (no action unless the founder asks)

These are logged so they are not rediscovered from scratch; none of them is a decision sitting
on the founder's desk today.

| Item | Date | Note |
|---|---|---|
| Meta One auto-enable | 2026-11-04 | See row 4b — **founder decision due today** |
| Render PHP2Shell advisory | 2026-11-04 (inbox) | Render emailed: update to 22.23.4/24.22.1/26.12.1 — PHP2Shell RCE (passwords/tokens/API keys). **Lazynext has no Render service** (dashboard.render.com is sign-in-only, never deployed) — advisory logged, no instance to patch. Recheck only if a Render service is ever created. |
| Railway risk-assessment notice | 2026-11-04 (inbox) | "Workspace does not meet the criteria we used to identify higher-risk workspaces" — informational; **no Railway service exists** (login-only desk). No action. |
| Aikido Brotli CVE-2026-111497 | 2026-11-04 (inbox) | Remote-code-exec via Brotli. Aikido's own scan item; operational exposure low (no user-facing Brotli decode path). Confirm Aikido's next natural scan clears/snoozes it; do not blind-bump. |
| Internal report truthfulness | 2026-11-04 | Full-body read flagged an agent-written finance report (2026-10-26) that called the single Pro license a paid subscription — real state is **0 subscriptions**, that license is the **self-issued dogfood license** (`support@lazynext.com`), and Dodo is permanently in test mode (**$0 collectable revenue**). Same fabrication class as founder brief PR #112. **Fixed 2026-11-04** (`feat/final-two-fixes`): the generator (`agents/infrastructure/finance_agent.py`) now prepends a deterministic D1-quoted facts block and forbids paid/customer claims unless `subscriptions_active > 0`; wording corrected in `docs/ops/inbox-full-read-2026-11-04.md`. Never trust generated numbers — verify from D1. |
| NuGet `lazynext-ci-push` key expiry | ~2026-11-05 | **Let it expire.** Audited 2026-10-25: no `*.csproj`/`*.sln`/`*.nuspec`, no `dotnet nuget push` in any workflow, zero published packages — nothing consumes the key. Do not log in, do not mint a replacement. |
| mcp.so free listing — GitHub issue [#6529](https://github.com/chatmcp/mcpso/issues/6529) | Watch for comment/closure | Free community path for the remote MCP server. The web form only sells a $39 fast lane — do not pay it. |
| apis.io submission | Batched into their next catalog build | Submitted 2026-11-03, confirmation received, no listing URL yet. Do not resubmit; reply only if they email `support@`. |
| Aikido AGPL-3.0 finding on `postiz@1.0.0` | Snoozed until **2027-10-31** | Accepted risk on file (issue 54902341). Upstream image run unmodified, internal use only, not part of the proprietary product. Re-evaluate at expiry; do not delete `ops/postiz/package-lock.json`. |
| LinkedIn merge / company Page creation | **Closed permanently** | No company-document path exists — recovery is government ID + selfie only, and the founder's standing rule forbids personal ID. Do not re-file, do not loop the support chat. |

## Verification log

| Date (IST) | What was checked | Result |
|---|---|---|
| 2026-11-06 14:10 IST | **Ops sweep — listing queues, inbox, GSC, live health, funnel/governance (read-mostly; one PR, one launchd repair)** | Microsoft still **no verdict** (`from:supportmail@techsupport.microsoft.com newer_than:3d` → 0; SellerId `96466040` → only our own 2026-11-05 16:04 follow-up + the 22 Oct profile mail; `TrackingID#2610070060003196` → 4 threads, newest is ours). **Unread = 2**, both pure bulk (Auth0, Tumblr) — left unread, nothing archived. Actionable non-newsletter mail in 3 d: DEV.to reinstatement (already actioned 05:10) + the GSC *"We're validating your Page indexing issue fixes"* transactional note. Listings unchanged: **W3C PR #1459** still OPEN/unmerged, last activity our own `a11yloc` comment 2026-11-04T22:59Z; **mcp.so #6529** still OPEN, 0 comments, `updatedAt == createdAt` 2026-11-01T03:22Z; **apis.io** still absent (`search q=lazynext` → apis 0 / providers 0 / tags 0); **directree** page 200 but category still Monitoring & Observability (`applicationCategory` + breadcrumb), owner edits still pending; **AlternativeTo** search `q=lazynext` → 2 results, both unrelated (LazyNotes, Lazy Nezumi Pro) = still unlisted. **GSC** (account `u/1` = Lazynext AI): sitemaps all read **6 Nov 2026**, Success — apex `lazynext.com/sitemap.xml` **8** discovered, `blog.lazynext.com/wp-sitemap.xml` **5**, `checker.lazynext.com/sitemap.xml` **2**; Pages report still *Last update 23/10/2026* (29 not indexed / 6 indexed, stale aggregate) with duplicate-canonical validation **Started** (Google's own mail 2026-11-05 14:24 PST confirms it is being validated); URL Inspection now **indexed**: `/changelog`, `checker.lazynext.com/rules`, and the apex article `/blog/three-times-our-own-metrics-lied-to-us/`. **No indexing request submitted** (all three already indexed; nothing new). Health: apex 200, article 200, checker `/` 200, `/rules` 200, `api…/openapi.json` 200, dashboard 307 → `/login`, blog `/` 200, blog `/hello-world/` 301 → apex, blog article 301 → apex article, penpot 200. Platform: `/health` ok, `cron:last_tick` 2026-11-06T07:50:15Z (1.2 min old), funnel `subscriptions_active 0` / `scans_external_30d 6` / `scans_30d 136` / `trials_active 0` / `licenses_pro 1` / `email_contacts 54` / `crm_leads 78` / `crm_engaged 17` / `monitors 1`; `/decision/blocks?limit=5` newest id **425070** (2026-11-03T16:42Z, signwell human_only) — **nothing new today**; `/observer/reviews?limit=5` newest id **453630** (2026-11-05T22:47Z, `fleet_dispatch`, `safe`, no gaps) — **nothing new today**. Fleet: exactly **1** process (pid 666, 9 h 6 m). |
| 2026-11-06 14:05 IST | **Fixed: article canonical pointed at a 307** | `marketing/public/blog/…/index.html` declared `rel=canonical` and `og:url` at `/blog/three-times-our-own-metrics-lied-to-us` — verified live that URL **307s** to the trailing-slash form, which is the URL in `sitemap.xml` (the submitted one), in the docs/changelog footer links, and in the DEV.to `canonical_url`. So the declared canonical never resolved to a 200 page. Both tags now carry the trailing slash. **PR [#55](https://github.com/lazynextai/Autonomous-AI-Company-OS/pull/55)** — pushed, not merged (marketing worker is deployed separately and serves the apex too, so it needs the three-hostname re-check). No other apex page had this mismatch (all 7 checked: 1:1 canonical). |
| 2026-11-06 14:00 IST | **Fixed: `com.lazynext.docker-desktop` was never bootstrapped this login** | Listing launchd jobs for lazynext showed only `com.lazynext.fleet` + `com.lazynext.healthcheck`. The plist exists and reads `RunAtLoad` + `LaunchOnlyOnce` → `open -a Docker`, and `launchctl print-disabled` already said **enabled**, so it does load at every login; it simply had not been bootstrapped in this session. `launchctl bootstrap gui/$UID …` and `launchctl load -w …` both returned 0, and the job then leaves the launchd job list — the expected `LaunchOnlyOnce` behaviour after its single run. Docker was already up (7 containers), so the run was a no-op. |
| 2026-11-06 09:15 IST | **Blog wipe recurred (2nd time) — fixed permanently with edge 301s instead of another republish** | The blog container recreated again: `hello-world` **200** and our article copy **404** once more. Since every runtime publish is doomed, republishing is pointless churn. Added a small exact-path redirect map to `ops/wordpress/src/index.ts` (before the DO, GET/HEAD only) and deployed (`wordpress-blog`, version `542e162d`): **`/hello-world/` → 301 `https://lazynext.com/`** (removes the WordPress sample from the public domain for good) and **`/three-times-our-own-metrics-lied-to-us/` → 301 the durable apex article` (so the URL Google crawled always resolves, even after a wipe). Verified live: both 301 with the right target on GET and HEAD, and the blog home still **200**. No image rebuild, no paid tier, no content stored on the container. |
| 2026-11-06 08:20 IST | **Durable article page shipped on `lazynext.com` (blog container is NOT durable)** | Caught the blog reverting **mid-flight**: the post I published at 06:30 was live, then ~40 min later the same URL **404'd** and `hello-world` was back as the only post. Cause is designed behaviour, already documented in `ops/wordpress/NOTES.md` §7 — the blog is a CF Container with **no durable volume for content**; a cold boot/recreate restores the baked image and discards runtime writes. So **anything published to `blog.lazynext.com` can vanish**, and it must never be the canonical home of an article. Fix: published the article as a **static page on the apex** — `https://lazynext.com/blog/three-times-our-own-metrics-lied-to-us/` (deployed with marketing worker `7650705a`; apex 200, article 200, www 301, marketing 301 all re-verified per the post-deploy rule). Added it to `sitemap.xml` (now **8** URLs, Google read it same session) and cross-linked from the `docs` + `changelog` footers. Live test *"Page can be indexed"* → **one** indexing request submitted. DEV.to `canonical_url` now points at this apex page (was briefly pointed at the volatile blog URL, and was reverted immediately once the wipe was seen). |
| 2026-11-06 07:00 IST | **Blog re-checked and cleaned a second time** | Re-published the article to `blog.lazynext.com` (id 5, 200) and trashed `hello-world` again (`hello-world` → 404). This copy is explicitly **best-effort**: it exists until the next container cold boot. Durable copy is the apex page above. Do not treat a blog 404 as an incident — check `wpboot:last` and just republish if it matters. |
| 2026-11-06 06:30 IST | **Public blog cleaned: default "Hello world!" retired, real article published, sitemap submitted** | `blog.lazynext.com` had exactly **one** post — the WordPress sample *"Hello world!"* (id 1, dated 2026-09-30) — sitting publicly indexed on the company blog. Retired it to trash via `DELETE /wp-json/wp/v2/posts/1` (recoverable; now **404** live). Published the metrics article there as first-party content → **id 5**, `https://blog.lazynext.com/three-times-our-own-metrics-lied-to-us/` (200). Set the DEV.to copy's `canonical_url` to that URL so our own domain is canonical, not the syndicated copy (DEV.to `PUT` → 200, canonical confirmed). Blog sitemap `https://blog.lazynext.com/wp-sitemap.xml` (**already declared in its robots.txt**) was **never submitted** — submitted now: first attempt read *"Couldn't fetch"* (the container was cold-starting; a Googlebot-UA fetch then returned 200, worst case 20s), re-read seconds later as **Sitemap index / Success / 5 discovered**. New post live-test *"Page can be indexed"* → **one** indexing request submitted. |
| 2026-11-06 06:20 IST | **All three sitemaps now healthy** | `lazynext.com/sitemap.xml` 7 pages, `checker.lazynext.com/sitemap.xml` 2 pages, `blog.lazynext.com/wp-sitemap.xml` 5 children — **all Success, all read 6 Nov 2026**. Before today only the apex one existed in Search Console; the other two had never been submitted, which is why their pages were invisible to Google. |
| 2026-11-06 06:10 IST | **Real cause of the unindexed checker page found and fixed** | `checker.lazynext.com/rules` was **"URL is unknown to Google"** — no crawl, no sitemap, nothing. Cause was NOT robots and NOT canonical: `https://checker.lazynext.com/sitemap.xml` exists, returns 200, lists exactly 2 URLs (`/` and `/rules`), and `robots.txt` declares it — but the sitemap **had never been submitted** to Search Console (only the apex one was). **Submitted it** → Google: *"Sitemap submitted successfully"*, status **Success**, **2 pages discovered** on the same read. `/rules` then flipped from *"unknown to Google"* to *"Discovered – currently not indexed"* with the sitemap now shown as the discovery source; live test passed (*"Page can be indexed"*), so **one** indexing request was submitted. Checker root `/` was already **indexed**. |
| 2026-11-06 06:05 IST | **All 7 apex sitemap URLs classified (completes the earlier partial pass)** | `/pricing` **indexed**, `/docs` **indexed** (both now confirmed; `/` `/accessibility` `/legal` `/status` were confirmed earlier). Every page Google discovered from `lazynext.com/sitemap.xml` is indexed except `/changelog`, which is now in the priority queue. |
| 2026-11-06 06:00 IST | **Every remaining "not indexed" reason in the Pages report explained — no action needed on any** | The 29 not-indexed pages are all benign, verified by opening each bucket: *Duplicate without user-selected canonical* (1) = **`favicon.ico`**; *Blocked by robots.txt* (1) = **`dashboard.lazynext.com/`** (the private admin panel — blocking it is correct); *Not found 404* (16) = retired URLs; *Page with redirect* (3) = the intended `www`/`marketing` → apex 301s; *Alternative page with proper canonical* (2) = correct; *Crawled/Discovered – not indexed* (4) = thin pages. **Do not "validate fix" on any of these** — there is nothing to fix, and validating a correct exclusion just wastes a review slot. |
| 2026-11-06 05:20–05:40 IST | **Google Search Console — indexing pass (signed-in founder session available)** | Sitemap `https://lazynext.com/sitemap.xml` **submitted AND read 6 Nov 2026**, status **Success**, **7 pages discovered** (0 videos). URL Inspection: `/` **indexed**, `/accessibility` **indexed**, `/legal` **indexed**, `/status` **indexed**. `/changelog` was the one real gap — Google reported *"Discovered — currently not indexed"*; live test returned **"Page can be indexed"** (HTTP 200, no blockers), so **one** indexing request was submitted and Google answered verbatim *"Indexing requested — URL was added to a priority crawl queue."* No repeated submissions (Google warns they do not change queue position). Overall Page Indexing report still said *"Last update: October 23"* with 29 not-indexed / 6 indexed — stale, deliberately not treated as today's state. |
| 2026-11-06 05:10 IST | **DEV.to — account reinstated, article published** | Found the 2026-11-05 reinstatement mail from the DEV Team (**suspension lifted**). The stored keys were still 401 (tokens are not restored with an account), so a **new key was generated in the signed-in session** (`dev.to/settings/extensions`, description "Lazynext Platform Ops 2026-11"), verified `GET /api/users/me` → 200 as `lazynext`, and written to `.env` as `DEVTO_API_KEY`. Article **published** via `POST /api/articles` → **HTTP 201**, live at `https://dev.to/lazynext/three-times-our-own-metrics-lied-to-us-and-how-we-caught-it-p2h` (published_at 2026-11-06T00:07:30Z, tags webdev/programming/devops/productivity). The internal "publishing status" ops section was stripped before sending — it must never appear publicly. |
| 2026-11-06 05:05 IST | Microsoft reply re-check (direct Gmail API, `newer_than:3d` on microsoft/partner/SellerId/TrackingID + non-newsletter scan) | **Still no decision mail.** Only mail on the thread is our own 2026-11-05 16:04 follow-up. Non-newsletter inbound in the last 2 days: that follow-up plus one Aikido Security trial note — nothing actionable. |
| 2026-11-06 05:00 IST | Inbox unread count (Gmail API `is:unread`, not the MCP search — which ignores its query filter and returns a fixed list) | **0 unread.** |
| 2026-11-04 | Microsoft inbox sweep (`from:supportmail@techsupport.microsoft.com`, `subject:verification newer_than:2d`, seller / Partner Center / vetting `newer_than:3d`, SellerId `96466040`) | **No decision mail.** Newest message from that address is still the 2026-10-27 context email (TrackingID#2610070060003196) — the vetting-ops request that attempt 3 already answered. Nothing new since the 01:26 check; no action. |
| 2026-11-04 | Stale September draft campaign cleanup | `email_campaigns` id 8 (`sales-outreach-2026-09-29`, "Make Your Website Accessible to All", `draft`, `sent_count` 0, created 2026-09-28) deleted — 1 row. It duplicated subjects already fired by ids 5 and 7 to the same list, so it could never be safely sent. |
| 2026-11-04 05:20–05:40 | **Final completion sweep (A–D)** — Microsoft due-date, four directory listings, platform health + breakers + governance, fleet count | Full detail in the section below. Headline: **no Microsoft verdict**, no directory moved, everything green, one fleet process. Nothing sent, nothing signed in, no money moved, no config changed. |
| 2026-11-04 | **Two completion-sweep fixes (`feat/final-two-fixes`, no deploy)** | (a) **X readiness probe**: `worker/src/readiness.ts` sent `Bearer <cred>` for `conn:x`, but the stored credential is a durable **OAuth1 quad** (`ck|cs|at|ats`) — a guaranteed 401, so the matrix reported `x: probe-failed` while dispatch worked. Now a quad is recorded **`probe_supported = 0`** with a truthful `last_error` (dispatch verified separately); a bearer-shaped credential still gets a real `/2/users/me` probe, and unsupported rows clear stale verdicts. (b) **Finance-report fabrication**: the generator prompt labelled `licenses_pro=1` as users, so a report claimed a paid Pro subscription at $0 revenue. `core/operations/report_facts.py` now emits a D1-quoted VERIFIED FACTS block prepended to both the weekly finance report and the founder briefing, with hard no-fabrication rules. Wording corrected in `docs/ops/inbox-full-read-2026-11-04.md`. Verified: pytest `244 passed, 5 skipped`; worker `node --test` `267 passed`; `npx tsc --noEmit` clean. |

## 2026-11-05 university recipients restored (founder-authorized)

| Step | Result |
|---|---|
| Cause | Campaign 12 delivered to 5 universities; `click_unsubscribe` fired ~15 s later for `accessibility@uh.edu` and `accessibility@psu.edu` alongside `click` events on other links — the mail-scanner link-prefetch signature (no human could read and act that fast). |
| Founder decision | Explicitly authorized restoration: the opt-outs were machine-generated, not user intent. |
| Restore | `UPDATE email_contacts SET subscribed=1` for both (2 rows) · KV `unsub:` keys deleted (both read back `null`) · Brevo: neither address was ever blacklisted (`emailBlacklisted: null`, never added), so no third step needed. |
| Verified | `email_contacts` = **19 unsubscribed / 35 subscribed** (30 original + 5 universities); no duplicate rows. |
| NOT done | Neither address was re-emailed. Restoring the list is not permission to contact — that stays a separate founder decision. |
| Prevention | The GET-mutation bug that allowed this is fixed and live (`worker.js` post-only unsubscribe, product versions `41863278` / `392b0fd4`); a scanner can no longer unsubscribe anyone. |

## 2026-11-05 recheck (scheduled — done)

| Check | Result |
|---|---|
| Microsoft verdict (the calendar's 11-05 recheck) | **Still none.** `from:supportmail@techsupport.microsoft.com` → 3 threads total, all older: 27 Oct (the answered context email), 14 Oct, 7 Oct. `from:msftpc@microsoft.com newer_than:3d` → 0; `subject:verification newer_than:3d` → 0. **Nothing new since attempt 3.** Follow-up email stays pre-authorized for **11-06/11-07** — that is the next action, and it needs no founder input. |
| Unread mail | **0** (broadened News filter is holding — no accumulation). |
| Next action | 2026-11-06/07 email-only follow-up to the vetting thread (runbook §1), *after* re-checking no verdict landed. |

## 2026-11-06 Google Search Console session

| Step | Result |
|---|---|
| Duplicate-canonical validation | **Started** 2026-11-06. GSC issue report: 1 affected page (`https://lazynext.com/`), validation status "Validation Started". The duplicate-host 301 is live. |
| Sitemap | Re-submitted `https://lazynext.com/sitemap.xml` on 2026-11-06. Google confirmation: "Sitemap submitted successfully". Status Success; **last read 6 Nov; discovered 7 pages** (previously 6). |
| Homepage | URL Inspection says **Page is indexed**; requested a fresh crawl. |
| Pricing | URL Inspection says **Page is indexed**; requested a fresh crawl after the truthful copy update. |
| Docs | URL Inspection says **Page is indexed**. |
| Accessibility statement | Live URL test: **Page can be indexed**; index status "Discovered – currently not indexed". **Requested indexing**; confirmation: "URL was added to a priority crawl queue." |
| Status page | Inspection result did not load in this session; URL is in the successfully-read sitemap. No duplicate request sent. |
| Changelog | GSC stale 404 example is `https://lazynext.com/changelog` (last crawl 21 Oct), but a live GET follows to **200** today. Stale report; sitemap re-read requested. |

GSC's aggregate Page indexing report still shows "Last update: 23/10/2026" (29 not indexed / 6 indexed), so do **not** treat those aggregate counts as current yet. Sitemap is now read on 6 Nov and shows 7 discovered URLs. No further bulk requests made; avoid hammering GSC.

## 2026-11-04 evening verification

| Check | Result |
|---|---|
| Microsoft verdict | **Still none** — `from:supportmail@techsupport.microsoft.com newer_than:2d` → 0 threads; `from:msftpc@microsoft.com newer_than:5d` → 0. Follow-up stays gated to 11-06/07. |
| Unread mail | **0** — and the cause of repeated accumulation is fixed: the 4 archive filters (News/Vendor-Noise/OTP/CI) now `removeLabelIds: ["UNREAD","INBOX"]` so newsletters self-mark-read. Vendor-Watch untouched (keeps watch mail visible + unread). Verified: 5 filters present, 22 threads read in the last 24h. |
| Open PRs | 0 |
| Fleet | exactly 1 process |
| main | `dcaefbf` |

## 2026-11-04 final completion sweep

Read-only sweep run on the founder's instruction that everything completable today be finished.
Constraints honoured throughout: **no sends, no sign-ins, no payments, no deployments, no config
changes, no code edits** — this ledger entry is the only artifact.

### A. Microsoft Partner Center — verdict due today

**NO VERDICT as of 2026-11-04 05:35 IST.** Three queries against `support@lazynext.com`, all empty:

| Query | Threads |
|---|---|
| `from:supportmail@techsupport.microsoft.com newer_than:2d` | **0** |
| `from:msftpc@microsoft.com newer_than:5d` | **0** |
| `subject:(verification OR "Partner Center") newer_than:2d` | **0** |

Newest message from the vetting address is still 2026-10-27 16:44 UTC, `Swasthik b
<supportmail@techsupport.microsoft.com>`, *"Partner Center account verification rejected; email
OTP service fails with EmailToken_Verification_P…"* — the pre-attempt-3 context email that
attempt 3 already answered. The only Microsoft mail in the last 48 h is promotional (Azure
×2, Microsoft Advertising ×1).

**Actions deliberately not taken:** the follow-up email is pre-authorized for **2026-11-06 / 11-07
only** — sending today would be premature, so it was not sent. No sign-in was attempted; the
MSA `prompt=login` + `acr_values=mfa` chain needs a fresh code at every hop. Row 1 above still
owns the next step.

### B. Directory + listing watch

| Listing | Live result | Reading |
|---|---|---|
| **apis.io** | `/api/v1/search?q=lazynext` → `apis.total: 0`, `providers.total: 0`; `/api/v1/providers?q=lazynext` → `meta.total: 0`, `data: []` | Not in the catalog yet — expected; the 2026-11-03 submission is batched into their next build. Do not resubmit. |
| **mcp.so** ([#6529](https://github.com/chatmcp/mcpso/issues/6529)) | `state: open`, `comments: 0`, `created_at` **=** `updated_at` = `2026-11-01T03:22:32Z` | Untouched since filing — **no maintainer reply**. Keep watching the issue only. |
| **directree** | `directree.io/tool/accessibility-checker` → 308 → `www.directree.io/…` **200** (187 KB) | Public and healthy, **"Claimed by owner"**, "Founder-edited" provenance labels present, "Last updated: 1 November 2026". **Edits still pending:** primary category is still *Monitoring & Observability* (the Developer Tools change has not landed), and no gold Verified badge is rendered in the hero — "verified owner" appears only in the facts legend. Review window still ~**2026-12-06**. |
| **AlternativeTo** | Page itself is a 403 Cloudflare interstitial ("Just a moment…"); resolved instead through AlternativeTo's own catalog search: `q="Lazynext Accessibility Checker"` → **`total_count: 0`**; `q=lazynext` → `total_count: 2`, both unrelated (**LazyNotes**, **Lazy Nezumi Pro**) | **Still unlisted / pending review.** No owner-only view read, no account interaction. Free queue stays free — do not pay $5/$15. |

### C. Health, breakers, governance

| Check | Result |
|---|---|
| Platform `/health` (bearer) | `{"ok":true}`; bare GET → **401** as designed |
| `cron:last_tick` | `1793749815576` = **2026-11-03T23:50:15Z**, 7.4 min old at check — cron healthy |
| `config:decision_enforce` | **`approval`** (rank-based; `human_only` also covered, `auto` internal exempt) |
| `config:observer_mode` | absent → default **on** (logging only, enforces nothing) |
| `outbound_breaker_config` (D1 row 1) | `enabled: 1`, **`tripped_reason: null`**, `tripped_at: null` (updated 2026-11-02T20:01:36Z) |
| Breaker-denial events | **0.** Four `scope='connector'` rows in 48 h, all app-level: discord 204 ×2, youtube 400 (media-only), signwell 400 |
| `/api/v1/billing/funnel` | 200 — **scans_30d 137**, **scans_external_30d 7**, leads 1, waitlist 1, email_contacts 49, crm_leads 68, crm_engaged 15, trials_active 0, licenses_pro 1, licenses_free 0, subscriptions_active 0, monitors 1 |
| `/decision/packages` | 200 — 32 approved (all unexpired, `expiry_at` 2026-12-31), 2 executed, 2 failed, 2 voided |
| `/capability/matrix` | 200 — 45 connectors: 3 `probe-ok`, 2 `probe-failed`, 36 `configured-unprobed`, 4 `documented-only`, 0 absent. **`x` probe reads HTTP 401** from the worker-side probe while fleet-side X dispatch works — probe-scope only, not a dispatch failure |
| `/decision/blocks` | 200 — only the known **signwell `human_only`** rows (3 `decision_gate` rows in 7 d, all 2026-11-03 probes). Nothing new today; the boundary is holding |
| `scope='observer'` rows (48 h) | **8** — 7 `fleet_dispatch` + 1 `task_dispatch`, every recommendation `safe`, no gaps/flags. First real fleet-side observer evidence (the earlier runs were 0) |
| Public sites | `checker.lazynext.com/health` **200** `{"ok":true,"service":"accessibility-checker"}` · `lazynext.com` **200** · `dashboard.lazynext.com` **307** (auth gate, normal) · `penpot.lazynext.com` **200** · `marketing.lazynext.com` **200** |
| Fleet | **Exactly one** `run_agents.py` (pid 569, up 1 h 35 m), log active at 05:27 (`company_brain_updated`, `fetched_failed_workflows count=5`) |
| Workflow health | Latest 8 CI runs on `main` **all success** (newest 2026-11-03T23:53Z). The `count=5` above is the monitor's historic Sept failure list, not a new outage |

### D. Not due today (deliberately untouched)

- **Microsoft follow-up email** — pre-authorized window is **2026-11-06 / 11-07**; sending earlier is premature. Not sent.
- **Power Automate cancellation** — Premium trial converts ~**2027-01-28**; cancelling early kills the anonymous Teams webhook path. Not attempted.

## 2026-11-05 university send (campaign 12)

Founder-approved first-touch send of `email_campaigns` id 12 (`outreach-universities-2026-11-05`,
subject `A free WCAG 2.2 scan for university web teams`) to the five university accessibility
offices, using the §5.2 **surgical swap**: snapshot the 30 subscribed rows → insert the 5
universities (`source='outreach-universities-2026-11-05'`, ids 54–58) → temporarily unsubscribe
the 30 → verify the segment resolves to exactly 5 → send → **restore the 30**.

| Check | Result |
|---|---|
| Pre-send audience | **5 subscribed**, exact university set, 0 old-30 leaked (snapshot `/tmp/lz_pre_send.json`: 30 subscribed / 49 total) |
| Decision package | id **39** `approved` for `campaign:12` (expiry 2026-11-20), then closed to **`executed`** after the send so a repeat send cannot pass the gate |
| Send result | HTTP **200** `{sent:5, total:5, segment:"subscribed", consent_basis:"prospect"}`; campaign 12 `status='sent'`, `sent_count=5`, `sent_at=2026-11-04T21:19:29.787Z` |
| Delivered | **5 / 5** unique (`email_events` tagged `campaign:12`, first at 21:19:32Z) |
| Bounces / complaints | **0** (no hard/soft bounce, blocked, spam or invalid event) |
| Engagement | 3 `unique_opened`, 4 `click` across 2 institutions within ~40 s of delivery |
| Restored 30 | **yes** — all 30 snapshot addresses subscribed again, ids unchanged, `changes:30`; campaign 9 and 11 untouched |
| Subscribed total after | **33**, not 35 — see the finding below |

**Finding — two link-scanner unsubscribes.** `click_unsubscribe` fired for `accessibility@uh.edu`
(21:19:51Z, 19 s after delivery) and `accessibility@psu.edu` (21:19:56Z, 14 s after delivery), and
both **did** take effect: KV `unsub:` = `1` and `subscribed=0` on rows 56/58. The timing is far too
fast for a human reading the mail at two institutions — this is the documented mail-security
scanner prefetch pattern (the same class as campaign 9's `info@aph.org` "click"). The opt-outs were
**left in place deliberately**: a recorded unsubscribe through the legitimate signed mechanism is
not something ops may reverse, and CAN-SPAM/GDPR compliance outweighs a wobbly two more addresses.
Consequence: 3 universities remain contactable (Arizona, UT Austin, Illinois), 2 are suppressed
(uh.edu, psu.edu) and must **not** be re-contacted. Underlying platform weakness worth a deliberate
fix later (not done here, no deploy): the public `/unsubscribe` GET performs the mutation, so an
automated link prefetch can unsubscribe a recipient who never clicked. A confirm-then-POST step
(the `/cancel` + `/monitor` token pattern) would close it.

## 2026-11-06 05:00 IST fresh sweep (read-only)

Founder instruction: full fresh sweep, complete only safe items due NOW. Nothing sent, nothing signed in, no payments, no deployments, no D1/KV writes, no account edits.

| Check | Result |
|---|---|
| **Microsoft Partner Center** | **No reply to the 02:34 IST follow-up.** `from:supportmail@techsupport.microsoft.com newer_than:7d` → 0 threads; `from:msftpc@microsoft.com newer_than:7d` → 0; `subject:verification newer_than:2d` → only our own sent follow-up. Follow-up thread `1a1ad871aba72449` = 1 message (ours, 2026-11-05 21:04 UTC); case thread `1a17e3ff171c6ffe` still ends at the 27 Oct context mail. **No second follow-up sent** (forbidden). Next: wait; recheck 2026-11-07. |
| **Google Search Console** | **Unavailable this sweep** — no authenticated tab connected (Cursor browser 0 tabs; Chrome DevTools only `about:blank`; browser-tools 0 connected tabs). Did not open a browser; **no indexing requests made**. The earlier 11-06 session results stand (duplicate-canonical validation started, sitemap read 7 URLs, accessibility statement queued). |
| **apis.io** | Not in catalog yet: `/api/v1/search?q=lazynext` → apis 0 / providers 0 / tags 0; `/api/v1/providers?q=lazynext` → total 0. Expected — batched into their next build. Do not resubmit. |
| **mcp.so [#6529](https://github.com/chatmcp/mcpso/issues/6529)** | Still `OPEN`, 0 comments, `updatedAt` == `createdAt` = 2026-11-01T03:22:32Z. No maintainer movement. |
| **directree** | Page 200 (187 KB, redirects to `www`). Still **Monitoring & Observability** in JSON-LD + breadcrumb ("Developer Tools" appears only in the category-vocabulary list); "Last updated: 1 November 2026". Owner edits still pending; review ~**2026-12-06**. |
| **AlternativeTo** | Listing URL `alternativeto.net/software/lazynext-accessibility-checker/about/` → **404** (live fetch via Firecrawl; direct curl 403s at Cloudflare). Still unpublished; inbox still only the 24 Oct reminder. Free queue — do not pay. |
| **W3C WAI tools list [PR #1459](https://github.com/w3c/wai-evaluation-tools-list/pull/1459)** (adjacent check) | `OPEN`, not merged, `updatedAt` 2026-11-04T22:59:42Z (our `a11yloc` comment). No staff movement. |
| **WHOIS `lazynext.com`** | Verisign RDAP **200**: only the registrar entity (Spaceship, IANA 3862) + abuse contact — **no registrant block**; zero matches for UNITED GLOBAL / BALAJI / Bengaluru / 560095 / support@. Public exposure closed (restored or registrar-gated). Spaceship dashboard toggle still unconfirmed — needs founder login; due ~**2026-11-10**. |
| **Cloudflare observability** | No new mail since the 1 Nov invoice/payment cluster. Row 8 still due **2026-12-01**; no paid tier enabled, nothing to reply to. Public usage is not readable without login — not checked, not changed. |
| **Health** | platform `/health` (bearer) `{"ok":true}` (bare GET 401 as designed); `cron:last_tick` **2026-11-05 23:30:16 UTC** (fresh); `config:decision_enforce=approval`; `config:observer_mode` absent → default on. apex 200 · www 301 → apex · marketing 301 → apex · checker `/health` 200 · dashboard 307 → `/login` · penpot 200. |
| **Repo / fleet / mail** | main `c40970b` clean; **1** fleet process (pid 666, launchd `com.lazynext.fleet`); **0** open PRs (monorepo + product repo); **0** unread inbox threads. |
| **Due now?** | **Nothing further.** The only item due today (the Microsoft follow-up) was already sent at 02:34 IST and is now waiting. Every remaining row is future-dated (11-26, 12-01, 12-06, 2027-01-28) or externally waiting (replies, review queues). |
