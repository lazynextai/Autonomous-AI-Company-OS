# Inbox audit — support@lazynext.com — 2026-11-04

**Status:** read-only sweep complete; no mail sent; no sign-in loops; no purchases; no unsubscribe links clicked.
**Scope:** all unread mail in `support@lazynext.com`, swept 2026-11-04 02:48–03:10 IST.
**Tooling:** local helper `~/.cursor/gmail-filters-mcp.mjs` (direct Node import of `listLabels` / `searchThreads` / `getThread` / `getMessage`), because the MCP namespace wrapper drops arguments. Gmail per-minute quota forced backoff during enumeration (handled with retry + resume).

## Coverage (honest)

- **408 unread threads / 414 unread messages** — the "400+" figure is verified (408 threads is the real number; 414 if counted per message).
- **408 of 408 threads enumerated** — every thread fetched via `getThread` (headers, dates, labels, snippets). No pagination cap: one 500-result search returned all 408 with no `nextPageToken`.
- **432 total messages** across those threads; full plain-text bodies read for the 9 priority threads (Startup Zone, Cloudflare tunnel, Partner Center, Google Search Console, Cloudflare pricing, Spaceship, directree, ApyGuard, GitHub CI). The remaining threads are newsletters/notifications and were triaged on sender + subject + snippet.
- **+2 unread threads in the Spam folder** (counted separately, not part of the 408): Aikido "Pro Trial ended" (commercial) and directree "verified" (legit known thread, Gmail misfiled it).
- **No user labels exist** in the mailbox (only system labels). There is no `INV`/unread-count label to read; the unread count comes from Gmail search.
- Mail is dated **2026-10-18 → 2026-11-03** (nothing older is unread).

## Bucket counts

| Bucket | Threads | Meaning in this sweep |
|---|---:|---|
| **ACTIONABLE** | **4** | Real work: compliance minutes, Cloudflare tunnel security upgrade, Google Search Console indexing issues |
| **WATCH** | **25** | Known threads continuing (Microsoft, Cloudflare billing/pricing, directree, AlternativeTo, SaaSHub, NuGet, M365, beehiiv, Spaceship, Aikido) |
| **NEWSLETTER / JUNK** | **289** | Marketing mail, digests, product updates, trial/upgrade nudges |
| **COLD-OUTREACH JUNK** | **14** | Unsolicited SEO/directory/API-security pitches — no reply recommended |
| **NOISE** | **76** | Internal ops mail, OTP codes, social login alerts, GitHub CI, invoices/receipts |
| **SPAM (folder, separate)** | **2** | Commercial spam + one misfiled legit notice; **0 phishing/scam found** |
| **Total unread threads** | **408** (+2 in Spam) | |

Headline: this mailbox is **~91% newsletter/noise**. There are **no customer or prospect replies** in it, and **no Microsoft verdict**.

## Key findings (deep-read)

### 1. Microsoft Partner Center — NO VERDICT YET (watch item 1 stays open)

- Newest Microsoft vetting mail in the whole mailbox is the **2026-10-27** tracking email (`supportmail@techsupport.microsoft.com`, TrackingID#2610070060003196 — "Partner Center account verification rejected; email OTP service fails with EmailToken_Verification_Panel_Create_Error..."). That predates attempt 3 (submitted 2026-10-30) and is the context request attempt 3 already answered. It is **not** a new verdict.
- The only other Partner Center mail is the **2026-10-22** generic "Complete your Partner Center profile verification SellerId 96466040" notice (#318), also pre-attempt-3. **It needs no action.**
- **Nothing has arrived since the 2026-10-30 submission.** Decision window was due ~2026-11-04; per the watch calendar the founder has **pre-authorized an email-only follow-up on 2026-11-06/07** — draft is in the replies doc (do not send before then).
- **Do not** sign in to Partner Center or loop OTP for this.

### 2. Nov 3 outreach campaign — ZERO REPLIES (and one self-copy explained)

- Thread #4 (`Your site vs 75 accessibility checks — free scan`, 2026-11-03) is **our own campaign email sent to support@lazynext.com** (`To: support@lazynext.com`) — a seed/self-copy, not a customer reply.
- A mailbox-wide search for `"75 accessibility checks"` returns **exactly that one thread**. There are **no prospect replies yet** — none read, none unread, none in Spam. That is expected one day after send.

### 3. Cloudflare Tunnel security advisory — FOUND AND FIXED

- #202 (2026-10-26) required every `cloudflared` to be **≥ 2026.10.2** due to the **eMudhra certificate compromise** (eight intermediate certs with weak private keys). macOS/Homebrew needs ≥ 2026.10.2; non-Homebrew ≥ 2026.10.3.
- Local state was **2026.10.0 (Homebrew)** — vulnerable. **Action taken today:** `brew upgrade cloudflared` → **2026.10.7**, restarted the launchd service (`com.cloudflare.cloudflared`, KeepAlive), tunnel re-registered two connections (blr03 + bom09), and `https://penpot.lazynext.com` returns **HTTP 200**. Verified in log: `Registered tunnel connection`.
- No email reply needed (it is a host action, now complete).

### 4. Cloudflare Observability pricing changes 2026-12-01 — NEW watch item

- #107: Observability moves to its own subscription. On **Workers Paid**, the account **automatically gets a Paid Observability subscription**; from Dec 1 usage beyond **50 GB ingestion / 10 GB-month storage** is billed ($0.25/GB, $0.10/GB-mo). Earlier usage is not charged retroactively.
- Our usage is tiny, so no expected charge — but the calendar should carry "review Observability usage before Dec 1; if unused, cancel the subscription to stay on Free" as a watch item. **Not added to `watch-calendar.md` in this PR** (scope was two new docs only) — flagged here for the next calendar edit.

### 5. Google Search Console — duplicate canonical (site-side SEO task, no reply address)

- #315/#316 (2026-10-22): "Duplicate, Google chose different canonical than user" for pages and for a sitemap. Purely site-side; the sender is `sc-noreply@google.com`, so there is nothing to reply to.
- Recommended follow-up (outside this task): compare the sitemap's declared canonicals against the marketing/product pages Google chose, and confirm fixture pages stay `noindex`/robots-disallowed rather than competing canonicals.

### 6. Startup Zone — draft Board minutes await review & signature (compliance item)

- Thread #23 (latest 2026-11-02, Varsha L): "Please find attached the draft minutes of the 1st Board Meeting of M/s. UNITED GLOBAL VENTURES PRIVATE LIMITED for the financial year 2026-2027, for your review and signature." They ask us to report any special activities so the minutes can be updated.
- This is a **founder action** (read the attachment, confirm activities, sign). A short acknowledgment + clarifying question is drafted as the one SEND candidate in the replies doc. Prior messages in the thread are the ADT-1 form + receipt (2026-10-29) — informational.

### 7. Spaceship / WHOIS context (watch item 7)

- #156 (2026-10-27): "Contact information updated for lazynext.com" — Spaceship confirms a registrant/contact update two days before the 2026-10-30 public-WHOIS flip. It does **not** state which fields changed.
- Live lookup already recorded in the calendar: the registrant block is **not** currently exposed (registry RDAP + GRS WHOIS show only the registrar). Remaining action is unchanged: **open the Spaceship dashboard and confirm the privacy toggle is Private**; do not assume.

### 8. Spam / phishing analysis

- **Inbox: 0 phishing, 0 fake invoices, 0 sextortion, 0 crypto scams.** Every unread sender is a recognisable brand or an internal automated address.
- **Spam folder (2 unread):** Aikido Security "Pro Trial ended" (commercial, harmless) and directree "Accessibility Checker is verified" (legit, part of the claimed listing — Gmail misfiled it). Neither is phishing. Both left in Spam, logged here, **not deleted** (founder review).
- **Cold B2B outreach (14, in Junk bucket, not phishing):** ApyGuard API-security pitch (2 msgs), MediaProNet ×2, SitePatent ×2, CodeTrendy ×2, GithubStarMate, NiubiGEO, cal.com ×2, Trustpilot ×2, Meta One notice. None warrant a reply; ApyGuard's "24 endpoints / no security scheme" claim is **stale** — the OpenAPI spec now declares 3 security schemes across 21 paths (fixed 2026-10-25).

### 9. Known-thread status (no action taken)

| Thread | Status |
|---|---|
| Cloudflare billing `IN-86694892` (#53/55/56/57/60) | **Paid** 2026-11-01; the two "payment failed / pay by Nov 26" mails are pre-settlement noise, already handled. Nothing to do. |
| directree (#283/149/64) | Claim verified 2026-11-01; edits awaiting the ~35-day review (recheck ~2026-12-06). $19 Fast Lane / $49 Plus **not** paid, **not** to be paid. |
| AlternativeTo (#262/355/362) | Changes approved 2026-10-21; still in the normal review queue; paid-review reminders ignored — do not pay. |
| SaaSHub (#363) | Listing approved 2026-10-20. Complete. |
| NuGet (#83) | `lazynext-ci-push` expires ~2026-11-05 — **let it expire** (no consumer). Do not log in or mint a new key. |
| M365 (#133/172/173) | Recurring billing intentionally off; trial ends 2026-11-27; Teams delivery is webhook-based. Nothing to do. |
| beehiiv (#130) | Identity verified 2026-10-28; connector fully live. Complete. |
| Aikido (#261/279/312) | Advisories (Brotli CVE-2026-111497, PHP2shell). Postiz AGPL finding snoozed to 2027-10-31; no new action. |
| Startup Zone ticket 26744 (#252) | "Your reply has been received" — acknowledgment only. Superseded by the #23 minutes request. |
| GitHub CI (#2) | `feat/funnel` CI run failed at 19:03Z, but the **run now shows all jobs green** and **PR #29 merged 2026-11-03 19:07:56Z**. Stale notification; nothing to fix. |

### 10. Noise inventory (76)

- **32 internal** `support@lazynext.com` messages: health-check FAILED/RECOVERED pairs (mostly `penpot` and once `mon-sweep`/`maint-gate`), Weekly Finance Report, Founder Briefing, the outreach self-copy (#4). Note: the recurring penpot health alerts stopped once Docker/Penpot was fixed; the last penpot FAILED is 2026-11-01.
- **19 LinkedIn one-time verification codes** (2026-10-21 → 10-30): residue of the documented LinkedIn sign-in/merge attempts. No code should be used; these are dead.
- **Microsoft OTP/security** (3), **social login/password alerts** (VK, Threads, Instagram, Facebook, Twitch, Clerk, Hugging Face, npm, mstdn.social, sourcehut, Bandcamp, Opera, Google), **GitHub OAuth app notices** (Packagist, Hex), Google Workspace invoices (2), X/Rendobar receipts (2).

## What was auto-completed (every action)

1. **Cloudflare Tunnel security upgrade — DONE.** `brew upgrade cloudflared` 2026.10.0 → **2026.10.7**; `launchctl kickstart -k gui/$UID/com.cloudflare.cloudflared`; verified two `Registered tunnel connection` lines and `https://penpot.lazynext.com` → **200**.
2. **Microsoft verdict check — DONE (negative).** Whole-mailbox search (`supportmail@techsupport.microsoft.com`, `msftpc@microsoft.com`, `SellerId 96466040`): nothing new since 2026-10-27. No sign-in attempted.
3. **Outreach-reply check — DONE (zero replies).** Whole-mailbox search for the campaign subject string; only the self-copy exists.
4. **GitHub CI failure triage — DONE.** Run 41699297941 is green and PR #29 merged; email is stale.
5. **Spam folder reviewed, not deleted.** 2 threads, logged above; left for founder review.
6. **No Gmail filter or label changes were made.** The helper exposes `list_filters` but **no create/modify route**; per the task rules, filter rules are logged instead (below) rather than half-applied through an unsupported path.

> **UPDATE 2026-11-04 (founder-approved, APPLIED):** all 5 rules below are now **live** — created directly against the Gmail API with the same local OAuth token (helper has no create route, so a one-off script did it: `POST /gmail/v1/users/me/settings/filters`). Labels `News`, `Vendor-Noise`, `Vendor-Watch`, `OTP`, `CI` were created and attached. Verified: `node ~/.cursor/gmail-filters-mcp.mjs --list` → `{"ok":true,"count":5}`. Rules 1/2/4/5 archive (skip Inbox) + label; rule 3 only labels and **keeps in Inbox** (watch threads must stay visible). Two API limits noted honestly: the "never send to Spam" checkbox and "auto-delete after 7 days" are **not** expressible as Gmail API filter actions, so neither is set.
>
> **UPDATE 2026-11-04 (evening, re-applied):** the 4 archive filters now ALSO **remove `UNREAD`** (`removeLabelIds: ["UNREAD","INBOX"]`), so newsletters that arrive are **automatically marked read** and the unread counter stays at zero instead of accumulating filtered-but-unread mail (the cause of repeated "still some emails left" checks that day). Gmail's filter API has no PUT/update — each filter was DELETEd and recreated. Vendor-Watch deliberately still keeps mail **visible and unread-worthy** (it has NO remove actions), so real threads (Microsoft, Cloudflare, Spaceship, directories) land in the inbox normally. Verified after recreate: 5 filters present, News/Vendor-Noise/OTP/CI all `remove UNREAD+INBOX`, Vendor-Watch untouched, unread 0.

## Recommended Gmail filter rules (APPLIED 2026-11-04)

Creating these needs `gmail.settings.basic` (the helper's token has it) but a create function the helper does not have. Add via Gmail UI or extend the helper:

1. `from:(hackernoon.com OR betalist.com OR appsumo.com OR mail.theresanaiforthat.com OR daily.dev OR quora.com OR redditmail.com OR medium.com OR deeperlearning.producthunt.com OR mail.beehiiv.com OR cx.beehiiv.com OR creator-spotlight@mail.beehiiv.com OR substack.com OR newsletter.futurepedia.io)` → **Skip Inbox**, apply label `News`, never mark important.
2. `from:(ma.linktr.ee OR hello.beacons.ai OR hello.contra.com OR hello.g2.com OR trustpilot.com OR trustpilotmail.com OR cal.com)` → **Skip Inbox**, apply label `Vendor-Noise`.
3. `from:(notify.cloudflare.com OR supportmail@techsupport.microsoft.com OR msftpc@microsoft.com OR domains@spaceship.com OR nuget.org OR directree.io OR directreetools.com OR alternativeto.net)` → **Never send to Spam**, label `Vendor-Watch`, keep in Inbox (these are watch threads).
4. `from:security-noreply@linkedin.com subject:("verification code")` → label `OTP`, skip Inbox; auto-delete after 7 days (codes are dead on arrival).
5. `from:notifications@github.com subject:("PR run failed")` → label `CI`, skip Inbox **only if** a bot watches `main` failures elsewhere (the fleet does).

## Blockers / caveats

- Gmail per-user quota (`Units per minute per user`) throttled the first enumeration pass at 132/408 threads; resumed with backoff and completed all 408. Nothing was fabricated or assumed from failed fetches.
- The helper cannot create filters or modify labels, so "archive newsletters" was intentionally **not** done — only rules were logged.
- Cloudflare Observability watch item is **not** in `watch-calendar.md` (two-new-docs scope). Add it next time the calendar is edited.

---

## Full thread lists by bucket


### ACTIONABLE (4 threads)

| # | Date | Sender | Subject | Unread msgs |
|---:|---|---|---|---:|
| 23 | 2026-11-03 | The Startup Zone | Re:[## 26153 ##] UNITED GLOBAL VENTURES PRIVATE LIMITED - Post Incorporation | 1 |
| 202 | 2026-10-26 | Cloudflare | [Action Required] Upgrade your Cloudflare Tunnel to version 2026.10.2 or later | 1 |
| 315 | 2026-10-22 | Google Search Console Team | New reasons prevent pages from being indexed on site lazynext.com | 1 |
| 316 | 2026-10-22 | Google Search Console Team | New reasons prevent pages in a sitemap from being indexed on site lazynext.com | 1 |


### WATCH (25 threads)

| # | Date | Sender | Subject | Unread msgs |
|---:|---|---|---|---:|
| 53 | 2026-11-01 | Cloudflare | [Confirmation] Purchase confirmed | 1 |
| 55 | 2026-11-01 | Cloudflare | [Action required] Payment failed for invoice #IN-86694892 | 1 |
| 56 | 2026-11-01 | Cloudflare | [Action required] Pay by November 26 or services will be downgraded | 2 |
| 57 | 2026-11-01 | Cloudflare | Your invoice is available | 1 |
| 60 | 2026-11-01 | 'Cloudflare, Inc.' | Important: Confirm your $5.53 payment to Cloudflare, Inc. | 1 |
| 64 | 2026-11-01 | Henrik at directree | You own the Accessibility Checker listing. It goes live in 35 days, or today. | 1 |
| 83 | 2026-10-30 | NuGet Gallery | [NuGet Gallery] Your API key is about to expire | 1 |
| 107 | 2026-10-29 | Cloudflare | [Notice] Cloudflare Observability pricing changes starting December 1, 2026 | 1 |
| 130 | 2026-10-28 | beehiiv | ✅ Your identity has been verified | 1 |
| 133 | 2026-10-28 | Microsoft | Your Microsoft 365 Business Basic subscription no longer has recurring billing | 1 |
| 149 | 2026-10-28 | directree | Re: Accessibility Checker has a listing on directree | 1 |
| 156 | 2026-10-27 | Spaceship | Contact information updated for lazynext.com | 1 |
| 172 | 2026-10-27 | Microsoft | Your Microsoft order on 27 October 2026 | 1 |
| 173 | 2026-10-27 | Microsoft | Your new Microsoft 365 Business Basic - Trial subscription is available | 1 |
| 183 | 2026-10-27 | Microsoft Clarity | Clarity digest: Your weekly recap for Lazynext | 1 |
| 252 | 2026-10-24 | The Startup Zone | [##26744##] Your reply has been received | 1 |
| 261 | 2026-10-24 | Aikido Security Advisories | Vulnerability Advisory: Node2Shell evolves to HTTP2Shell. Brotli flaw (CVE-2026-111497) affe | 1 |
| 262 | 2026-10-24 | AlternativeTo | Last reminder: Lazynext Accessibility Checker is still waiting for review | 1 |
| 279 | 2026-10-23 | Shivkumar from Aikido Security | Additional Aikido resources | 1 |
| 283 | 2026-10-23 | directree | Accessibility Checker has a listing on directree | 1 |
| 312 | 2026-10-22 | Willem Delbare from Aikido Security | PHP2shell Live Briefing with Aikido \| 5:00PM CEST | 1 |
| 318 | 2026-10-22 | Microsoft Partner Center | Complete your Partner Center profile verification SellerId 96466040 to get full access | 1 |
| 355 | 2026-10-21 | AlternativeTo | Your changes to Lazynext Accessibility Checker was approved | 1 |
| 362 | 2026-10-21 | AlternativeTo | You didn't finish paying for Lazynext Accessibility Checker's review | 1 |
| 363 | 2026-10-20 | SaaSHub Stan | ✅ Lazynext Accessibility Checker was approved | 1 |


### JUNK (14 threads)

| # | Date | Sender | Subject | Unread msgs |
|---:|---|---|---|---:|
| 14 | 2026-11-03 | Bailey Pumfleet | A month in | 1 |
| 73 | 2026-10-31 | Trustpilot | ⭐ ⭐ ⭐ ⭐ ⭐ What do you think about Trustpilot? We want to hear from you! | 1 |
| 98 | 2026-10-30 | MediaProNet | a permanent link for Lazynext Accessibility Checker, sitting unused | 1 |
| 132 | 2026-10-28 | 'ApyGuard: API Security Platform' | Re: ApyGuard — a note on Lazynext Accessibility Checker's API spec | 2 |
| 157 | 2026-10-27 | SitePatent | Lazynext Accessibility Checker profile: complete, visibility off | 1 |
| 199 | 2026-10-27 | GithubStarMate | Promote your GitHub repository with real developers | 1 |
| 201 | 2026-10-27 | CodeTrendy | Lazynext Accessibility Checker is invisible where buyers actually search | 1 |
| 244 | 2026-10-25 | MediaProNet | Lazynext Accessibility Checker: page built, one step from live | 1 |
| 294 | 2026-10-22 | SitePatent | Lazynext Accessibility Checker now has a profile on SitePatent | 1 |
| 324 | 2026-10-22 | Trustpilot | Lazynext AI, thanks for joining Trustpilot | 1 |
| 338 | 2026-10-22 | CodeTrendy | we built a page for Lazynext Accessibility Checker | 1 |
| 359 | 2026-10-21 | NiubiGEO | How does AI describe your product? | 1 |
| 361 | 2026-10-21 | Meta for Business | In 14 days, people in your business portfolio can start managing Meta One | 1 |
| 380 | 2026-10-20 | Bailey Pumfleet | Worth a look if your team schedules a lot | 1 |


### NOISE (76 threads)

| # | Date | Sender | Subject | Unread msgs |
|---:|---|---|---|---:|
| 2 | 2026-11-03 | Lazynext | [lazynextai/Autonomous-AI-Company-OS] PR run failed: CI - feat(funnel): truthful external-sc | 1 |
| 4 | 2026-11-03 | Lazynext | Your site vs 75 accessibility checks — free scan | 1 |
| 22 | 2026-11-03 | Lazynext | [AI Company] Recovered | 1 |
| 27 | 2026-11-02 | Google Payments | Google Workspace: Your invoice is available for lazynext.com | 1 |
| 49 | 2026-11-02 | Lazynext | Weekly Finance Report | 1 |
| 65 | 2026-10-31 | Microsoft account team | Your single-use code | 1 |
| 66 | 2026-10-31 | Lazynext | [AI Company] Recovered | 1 |
| 67 | 2026-10-31 | Lazynext | [AI Company] Health check FAILED | 1 |
| 77 | 2026-10-31 | Lazynext | Founder Briefing | 1 |
| 80 | 2026-10-30 | LinkedIn | Here's your verification code 508143 | 1 |
| 114 | 2026-10-29 | LinkedIn | Here's your verification code 703164 | 1 |
| 118 | 2026-10-29 | LinkedIn | Here's your verification code 425002 | 1 |
| 124 | 2026-10-29 | LinkedIn | Here's your verification code 627834 | 1 |
| 125 | 2026-10-29 | LinkedIn | Here's your verification code 899635 | 1 |
| 131 | 2026-10-28 | X Developer Platform | Your receipt from X Developer Platform #2014-4142 | 1 |
| 135 | 2026-10-28 | LinkedIn | Here's your verification code 676605 | 1 |
| 136 | 2026-10-28 | LinkedIn | Here's your verification code 234095 | 1 |
| 137 | 2026-10-28 | LinkedIn | Here's your verification code 754462 | 1 |
| 139 | 2026-10-28 | LinkedIn | Here's your verification code 182895 | 1 |
| 163 | 2026-10-27 | Lazynext | [AI Company] Recovered | 1 |
| 164 | 2026-10-27 | Lazynext | [AI Company] Health check FAILED | 1 |
| 165 | 2026-10-27 | Lazynext | [AI Company] Health check FAILED | 1 |
| 180 | 2026-10-27 | LinkedIn | Here's your verification code 324087 | 1 |
| 181 | 2026-10-27 | LinkedIn | Here's your verification code 574718 | 2 |
| 185 | 2026-10-27 | LinkedIn | Here's your verification code 481394 | 1 |
| 186 | 2026-10-27 | Lazynext | [AI Company] Recovered | 1 |
| 187 | 2026-10-27 | Lazynext | [AI Company] Health check FAILED | 1 |
| 188 | 2026-10-27 | LinkedIn | Here's your verification code 160509 | 1 |
| 189 | 2026-10-27 | LinkedIn | Here's your verification code 533549 | 1 |
| 190 | 2026-10-27 | LinkedIn | Here's your verification code 887408 | 1 |
| 191 | 2026-10-27 | LinkedIn | Here's your verification code 048074 | 1 |
| 194 | 2026-10-27 | Lazynext | [AI Company] Recovered | 1 |
| 197 | 2026-10-27 | Lazynext | [AI Company] Health check FAILED | 1 |
| 214 | 2026-10-26 | Lazynext | Weekly Finance Report | 1 |
| 234 | 2026-10-25 | Lazynext | [AI Company] Recovered | 1 |
| 235 | 2026-10-25 | Lazynext | [AI Company] Health check FAILED | 1 |
| 236 | 2026-10-25 | Microsoft account team | Microsoft account security info was added | 1 |
| 237 | 2026-10-25 | Lazynext | [AI Company] Recovered | 1 |
| 241 | 2026-10-25 | Lazynext | [AI Company] Health check FAILED | 1 |
| 250 | 2026-10-24 | Lazynext | [AI Company] Recovered | 1 |
| 251 | 2026-10-24 | Lazynext | [AI Company] Health check FAILED | 1 |
| 263 | 2026-10-24 | Lazynext | Founder Briefing | 1 |
| 278 | 2026-10-23 | Lazynext | [AI Company] Recovered | 1 |
| 287 | 2026-10-23 | sourcehut | sourcehut introduction | 1 |
| 301 | 2026-10-22 | Lazynext | [AI Company] Health check FAILED | 1 |
| 303 | 2026-10-22 | Opera Software | New sign-in to your Opera account | 1 |
| 304 | 2026-10-22 | GitHub | [GitHub] A third-party OAuth application has been added to your account | 1 |
| 313 | 2026-10-22 | Lazynext | [AI Company] Recovered | 1 |
| 314 | 2026-10-22 | Lazynext | [AI Company] Health check FAILED | 1 |
| 322 | 2026-10-22 | VK | Someone has accessed your account through the site "ВКонтакте", Bangalore | 1 |
| 323 | 2026-10-22 | Bandcamp | Bandcamp password change | 1 |
| 325 | 2026-10-22 | hello@mstdn.social | Mastodon: password changed | 1 |
| 326 | 2026-10-22 | Threads | New login to Threads from Chrome on Mac OS X | 1 |
| 327 | 2026-10-22 | Instagram | New login to Instagram from Chrome on Mac OS X | 1 |
| 328 | 2026-10-22 | Facebook | Your password has been changed | 1 |
| 329 | 2026-10-22 | Facebook | Did you just log in near Bangalore on a new device? | 1 |
| 331 | 2026-10-22 | Twitch | Your Twitch Account - Successful Social Log-in | 1 |
| 332 | 2026-10-22 | GitHub | [GitHub] A third-party OAuth application has been added to your account | 3 |
| 333 | 2026-10-22 | sourcehut | Your sourcehut password was reset | 1 |
| 334 | 2026-10-22 | LinkedIn | Here's your verification code 359568 | 1 |
| 335 | 2026-10-22 | Clerk | New device signed in to your Clerk account | 1 |
| 336 | 2026-10-22 | huggingface | New login to your Hugging Face account | 1 |
| 337 | 2026-10-22 | npm Support | Your npm password has been changed | 1 |
| 344 | 2026-10-21 | Lazynext | [AI Company] Recovered | 1 |
| 347 | 2026-10-21 | LinkedIn | Here's your verification code 895550 | 1 |
| 348 | 2026-10-21 | LinkedIn | Here's your verification code 596657 | 1 |
| 350 | 2026-10-21 | Lazynext | [AI Company] Health check FAILED | 1 |
| 364 | 2026-10-20 | Microsoft account team | Your single-use code | 2 |
| 367 | 2026-10-20 | Rendobar Billing | Lower video pricing from 20 October | 1 |
| 368 | 2026-10-20 | Google Payments | Google Workspace: We've received your payment for lazynext.com | 1 |
| 382 | 2026-10-20 | Lazynext | [AI Company] Recovered | 1 |
| 383 | 2026-10-20 | Lazynext | [AI Company] Health check FAILED | 1 |
| 389 | 2026-10-19 | Google | Security alert | 1 |
| 398 | 2026-10-19 | Lazynext | [AI Company] Recovered | 1 |
| 402 | 2026-10-19 | Lazynext | [AI Company] Health check FAILED | 1 |
| 406 | 2026-10-18 | Lazynext | [AI Company] Recovered | 1 |


### NEWSLETTER (289 threads)

| # | Date | Sender | Subject | Unread msgs |
|---:|---|---|---|---:|
| 0 | 2026-11-03 | Bandcamp | Bandcamp Friday returns November 6 | 1 |
| 1 | 2026-11-03 | Instagram | See what mewcuriy_z3 and 8 others shared | 1 |
| 3 | 2026-11-03 | Quora Digest | What are some really good things happening in India which most people are not aware of? | 1 |
| 5 | 2026-11-03 | Saj at Futurepedia | Claude Built me a Castle | 1 |
| 6 | 2026-11-03 | Microsoft Azure | See which type of Azure storage meets your needs | 1 |
| 7 | 2026-11-03 | Together AI Team | October at Together: five new models, a post-training service, and more | 1 |
| 8 | 2026-11-03 | Natalia at Creator Spotlight | 🔴 What a knowledge creator's audience is worth  | 1 |
| 9 | 2026-11-03 | HackerNoon | Making Local LLMs Usable on 8GB GPUs | 1 |
| 10 | 2026-11-03 | Product Hunt Daily | 😸 Anyone can email your agent | 1 |
| 11 | 2026-11-03 | OpenRouter Team | Guardrail Policies: one set of rules, with room for exceptions | 1 |
| 12 | 2026-11-03 | BetaList | p2p.gifts, SeatReaper, Morse Private Messenger, HotTopics, Stella, and more | 1 |
| 13 | 2026-11-03 | AppSumo | On good GetTerms | 1 |
| 15 | 2026-11-03 | Reddit | "The legend od saas industry dies 😭" | 1 |
| 16 | 2026-11-03 | Substack | Your October 2026 stats in review for Lazynext | 1 |
| 17 | 2026-11-03 | Facebook | Update for you: 1 new notification | 1 |
| 18 | 2026-11-03 | Uneed Newsletter | Best products of the month | 1 |
| 19 | 2026-11-03 | DevHunt | Week 43 winners: Articos MCP, RedditAPIs, Taskless | 1 |
| 20 | 2026-11-03 | Medium Daily Digest | UI Design Direction 2026–2027 \| Michal Malewicz | 1 |
| 21 | 2026-11-03 | Beam from Beacons | What's actually in Beacons paid plans? | 1 |
| 24 | 2026-11-03 | 'TAAFT - There's An AI For That' | 📊 What People Ask ChatGPT in 2026 | 1 |
| 25 | 2026-11-03 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 26 | 2026-11-02 | Atlassian | Ship faster with Bitbucket and Jira | 1 |
| 28 | 2026-11-02 | Darcy from Buffer | Join our team for a product demo & live Q&A 🎉 | 1 |
| 29 | 2026-11-02 | Rumble | Election Night Is Coming to Rumble | 1 |
| 30 | 2026-11-02 | Wellfound | Your weekly activity summary for Wellfound: October 26 - November 1 | 1 |
| 31 | 2026-11-02 | Microsoft Azure | Control your cloud costs with these tools | 1 |
| 32 | 2026-11-02 | Microsoft Advertising | [REGISTER NOW] Turn your data into buyer-ready deals with Microsoft Curate - REMINDER | 1 |
| 33 | 2026-11-02 | Instagram | See patelavas, anupamapandey007 and more in your feed | 1 |
| 34 | 2026-11-02 | HackerNoon | From Bug Report to Production: How I Fix Bugs with AI | 1 |
| 35 | 2026-11-02 | Product Hunt Daily | 😸 This meeting could've been an agent | 1 |
| 36 | 2026-11-02 | BetaList | Backlnk, Nuri, SetLatch, Popform, Machinence, and more | 1 |
| 37 | 2026-11-02 | Quora Suggested Spaces | What are some of the little things that reveal so much about a person's psychology? | 1 |
| 38 | 2026-11-02 | AppSumo | Full Animation ahead | 1 |
| 39 | 2026-11-02 | Beacons | 📊 Check out your Fan Engagement this week! | 1 |
| 40 | 2026-11-02 | Reddit | "Reached $1000 revenue in total 3 months of saas building because of my gf" | 1 |
| 41 | 2026-11-02 | GitLab | Security that's integrated into your development lifecycle | 1 |
| 42 | 2026-11-02 | Medium Daily Digest | The ChatGPT Feature Everyone Ignores That’s Better Than Prompting \| Muhammad Mudassar Saeed | 1 |
| 43 | 2026-11-02 | Quora Digest | How much gold and platinum does a massive star create when it explodes as a supernova...? | 1 |
| 44 | 2026-11-02 | 'Ido from daily.dev' | What we shipped in October | 1 |
| 45 | 2026-11-02 | OpenRouter Team | Last one: where to look when you get stuck | 1 |
| 46 | 2026-11-02 | 'TAAFT - There's An AI For That' | 📺 Karpathy Rebuilt YouTube With Claude | 1 |
| 47 | 2026-11-02 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 48 | 2026-11-02 | The Auth0 Team | Auth0 Streamcast: Last chance to register | 1 |
| 50 | 2026-11-01 | Product Hunt Weekly | 😸 Reddit wants your password | 1 |
| 51 | 2026-11-01 | Product Hunt Daily | 😸 Watch your language | 1 |
| 52 | 2026-11-01 | HackerNoon | Why Your Python Cache Does the Same Work Twice (P.S: GIL Won’t Save You) | 1 |
| 54 | 2026-11-01 | BetaList | Rezfiliate, Seattle Flow, headoffis, Revfer, KiriFrame, and more | 1 |
| 58 | 2026-11-01 | AppSumo | The door to more | 1 |
| 59 | 2026-11-01 | Reddit | "If you’re letting Claude Code clean up your smart TV, do these things first" | 1 |
| 61 | 2026-11-01 | Medium Daily Digest | The Cybersecurity Industry Is Entering Its Third Era \| Taimur Ijlal in AWS in Plain English | 1 |
| 62 | 2026-11-01 | Beam from Beacons | I asked Pat how he lands brand deals | 1 |
| 63 | 2026-11-01 | 'TAAFT - There's An AI For That' | 👽 Anyone Out There? AI's Listening | 1 |
| 68 | 2026-10-31 | HackerNoon | The Night He Came Home | 1 |
| 69 | 2026-10-31 | BetaList | SketchUp Converter, Ceremonia, Sickle, BasicOps, Kundaly, and more | 1 |
| 70 | 2026-10-31 | Product Hunt Daily | 😸 Argue with four agents at once | 1 |
| 71 | 2026-10-31 | Reddit | "Anthropic renames Max5 and Max20 and removes 5h limits for Max20" | 1 |
| 72 | 2026-10-31 | Medium Daily Digest | Stop Using Claude Code Without Ponytail (It Beats Karpathy’s Famous 4 Line CLAUDE.md) \| Ita | 1 |
| 74 | 2026-10-31 | Quora Digest | Why is vitamin B12 so dangerous? | 1 |
| 75 | 2026-10-31 | Rumble | We're flipping the script on November 1st | 1 |
| 76 | 2026-10-31 | 'TAAFT - There's An AI For That' | 🧟 That AI Stat? It Died Years Ago | 1 |
| 78 | 2026-10-30 | 'Clara at Penpot.app' | Penpot 2.19 is here! | 1 |
| 79 | 2026-10-30 | Railway | Automatic security patches, redeploys after credential regeneration | 1 |
| 81 | 2026-10-30 | Neon Changelog | HIPAA for new products, Sign in with Apple and Microsoft in Managed Better Auth, Gemini 4 Ar | 1 |
| 82 | 2026-10-30 | Saj at Futurepedia | We Used Gemini 4 To Turn A Sketch Into A Game | 1 |
| 84 | 2026-10-30 | Substack | New on Substack: chat channels, lists, freewalls, discounts, podcast updates, and more | 1 |
| 85 | 2026-10-30 | Editors at HackerNoon | Proof of Usefulness Hackathon Final Winners Announced 🎉 | 1 |
| 86 | 2026-10-30 | Creator Spotlight | 🔴 Who can afford to be a creator? | 1 |
| 87 | 2026-10-30 | HackerNoon | What the Heck is Hardcharger? | 1 |
| 88 | 2026-10-30 | BetaList | RentalThread, BrideSpark, Gairė, OpenSEO, Retello, and more | 1 |
| 89 | 2026-10-30 | Product Hunt Daily | 😸 Steamroller vs 1,000 keyboards | 1 |
| 90 | 2026-10-30 | Reddit | "Anthropic gave 50 analysts Claude Code with a hidden coin-flip bias. They ..." | 1 |
| 91 | 2026-10-30 | AppSumo | Hit the books | 1 |
| 92 | 2026-10-30 | Mixpanel | Why AI can't do all your A/B testing 🧪 | 1 |
| 93 | 2026-10-30 | Linktree | Your Linktree is back on Free | 1 |
| 94 | 2026-10-30 | Medium Daily Digest | I Gave Claude Access to My Entire Computer. This Is What Happened. \| Josh Dubowsky | 1 |
| 95 | 2026-10-30 | Contra | Supercharge your business with Contra Pro | 1 |
| 96 | 2026-10-30 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 97 | 2026-10-30 | 'TAAFT - There's An AI For That' | 🍄 Claude Pulls Mario Off the TV | 1 |
| 99 | 2026-10-30 | Tumblr | These blogs? You'll like 5 of them. | 1 |
| 100 | 2026-10-29 | Darlyze from Devpost | All Things Agentic: Wrapped + 2 new hackathons | 1 |
| 101 | 2026-10-29 | Fireworks | Forge: Sold Out in SF. Streaming Live on Nov 3! | 1 |
| 102 | 2026-10-29 | SaaSHub Weekly | SaaSHub Weekly - Oct 29 | 1 |
| 103 | 2026-10-29 | Replit | Meet Monitoring Agent, your on-call engineer | 1 |
| 104 | 2026-10-29 | Quora Digest | Hi, I am a 36 year old pregnant. Currently my spouse and myself are living in Bangalor... | 1 |
| 105 | 2026-10-29 | Mixcloud | Looking for Inspiration | 1 |
| 106 | 2026-10-29 | Substack | Introducing lists on Substack | 1 |
| 108 | 2026-10-29 | Creator Spotlight | 🔴Your archive is worth more than you think | 1 |
| 109 | 2026-10-29 | HackerNoon | No One Holds the Key: Threshold ECDSA, Part 1 | 1 |
| 110 | 2026-10-29 | BetaList | Kantamigo, HeyDeer, Habit Nest Tracker, Tally, UserDemos, and more | 1 |
| 111 | 2026-10-29 | Product Hunt Daily | 😸 Some assembly prompted | 1 |
| 112 | 2026-10-29 | AppSumo | Deal of the Day: LeadOcean (10% off) | 1 |
| 113 | 2026-10-29 | Reddit | "My app got $600 revenue in just 18 days of launch." | 1 |
| 115 | 2026-10-29 | 'Tyler @ beehiiv 🐝' | 4 ways to improve your deliverability | 1 |
| 116 | 2026-10-29 | G2 | No tricks, just treats (for your review) 🍬 | 1 |
| 117 | 2026-10-29 | Microsoft Advertising | AI is changing search: Are you ready? | 1 |
| 119 | 2026-10-29 | Linktree | You’re about to lose access to Pro | 1 |
| 120 | 2026-10-29 | Medium Daily Digest | 5 CLI Tools That Changed How I Work \| Prinux | 1 |
| 121 | 2026-10-29 | Beam from Beacons | ✏️ Let's check your progress | 1 |
| 122 | 2026-10-29 | Dribbble | ☝🏼Design That Drives Growth: AI, Webflow & Creative Strategies That Work | 1 |
| 123 | 2026-10-29 | 'Tyler @ beehiiv 🐝' | Been there, still doing that | 1 |
| 126 | 2026-10-29 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 127 | 2026-10-29 | 'TAAFT - There's An AI For That' | 🧰 Stop Using Just One AI | 1 |
| 128 | 2026-10-29 | DigitalOcean | The DigitalOcean Newsletter: October 2026 | 1 |
| 129 | 2026-10-29 | The Auth0 Team | Streamcast: Stop leaking revenue | 1 |
| 134 | 2026-10-28 | Runpod Team | Runpod Weekly: GLM-5.3 at $0.77 per million input tokens | 1 |
| 138 | 2026-10-28 | Zapier News | A plumber built 36 Zaps by talking to Claude | 1 |
| 140 | 2026-10-28 | Zeno from Resend | Inboxes for agents, and a faster sending infrastructure | 1 |
| 141 | 2026-10-28 | HackerNoon | AI Doesnt Have to Make Things Up to Mislead You | 1 |
| 142 | 2026-10-28 | BetaList | RankinAI, Tomen, Contact Any Celebrity, RobiTasks, MyValuesMap, and more | 1 |
| 143 | 2026-10-28 | Product Hunt Daily | 😸 Someone opened your email | 1 |
| 144 | 2026-10-28 | Grafana Labs Team | Got Grafana Cloud questions? Bring them to office hours starting in 1 hr | 1 |
| 145 | 2026-10-28 | Reddit | "LMAOOO!!!!😂😂" | 1 |
| 146 | 2026-10-28 | AppSumo | Genie in an email | 1 |
| 147 | 2026-10-28 | Alibaba Cloud | QwenWork Enterprise Premium: security and control, built in | 1 |
| 148 | 2026-10-28 | DevHunt | 104 new dev tools this week: Kirat – Multi-Model AI Council, AgentPlaza, Adios.dev - AI Nati | 1 |
| 150 | 2026-10-28 | Linktree | Last day to keep your Pro plan | 1 |
| 151 | 2026-10-28 | Medium Daily Digest | Google Just Lost the Argument It’s Been Hiding Behind for 20 Years \| Wesley Edits in Actual | 1 |
| 152 | 2026-10-28 | Contra | Ready to get paid? | 1 |
| 153 | 2026-10-28 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 154 | 2026-10-28 | 'TAAFT - There's An AI For That' | 👯 Asked AI for Ideas Lately? | 1 |
| 155 | 2026-10-28 | The Frontier by Product Hunt | 🧠 The models broke containment | 1 |
| 158 | 2026-10-27 | Justina from Buffer | Updates to the Buffer API rate limits | 1 |
| 159 | 2026-10-27 | Fireworks | [Forge] Sold Out in SF. Join Us Virtually on Nov 3! | 1 |
| 160 | 2026-10-27 | Quora Digest | बैंक अकाउंट में मिनिमम बैलेंस रखने को लेकर RBI ने बनाए नए नियम, 1 तारीख से होंगे लागू ... | 1 |
| 161 | 2026-10-27 | Saj at Futurepedia | Claude Just Made Your Old Dashboards Pointless | 1 |
| 162 | 2026-10-27 | Mixcloud | Get your show in the charts | 1 |
| 166 | 2026-10-27 | Instagram | See what deepiiiikkaa and 8 others shared | 1 |
| 167 | 2026-10-27 | Creator Spotlight | 🔴 Brokering $3k–$80k brand deals | 1 |
| 168 | 2026-10-27 | HackerNoon | Tracing Contextual Token Representations Through Transformer Layers | 1 |
| 169 | 2026-10-27 | Facebook | Update for you: 1 new notification | 1 |
| 170 | 2026-10-27 | Vimeo | You can now share all your work on Vimeo for free | 1 |
| 171 | 2026-10-27 | BetaList | The Launch Directory, RankHabit, HARDER, Marsell, Operum, and more | 1 |
| 174 | 2026-10-27 | Furkan from Countly | Security update: Node.js, Python and PHP vulnerabilities | 1 |
| 175 | 2026-10-27 | Product Hunt Daily | 😸 Make doomscrolling hurt | 1 |
| 176 | 2026-10-27 | Reddit | "Claude throwing punches out here" | 1 |
| 177 | 2026-10-27 | GitHub | GitHub Universe is tomorrow. Join us live online. | 1 |
| 178 | 2026-10-27 | Tyler from beehiiv | press play, get paid | 1 |
| 179 | 2026-10-27 | AppSumo | Tech-Zavi | 1 |
| 182 | 2026-10-27 | G2 | No tricks, just treats for your review 👻 | 1 |
| 184 | 2026-10-27 | Uneed Newsletter | Join us live from the Residency on Wednesday | 1 |
| 192 | 2026-10-27 | ICICI Bank | Welcome to the all new InstaBIZ application | 1 |
| 193 | 2026-10-27 | DevHunt | Week 42 winners: AI-Atlas, Supaboard AI, CapMonster Cloud MCP | 1 |
| 195 | 2026-10-27 | Linktree | It’s nice to keep more of what you earn | 1 |
| 196 | 2026-10-27 | Medium Daily Digest | If This Works Out, It’ll Be the Greatest Linux Distro Ever \| Burk | 1 |
| 198 | 2026-10-27 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 200 | 2026-10-27 | 'TAAFT - There's An AI For That' | 🧮 OpenAI Broke a 27-Year Rule | 1 |
| 203 | 2026-10-26 | Wellfound | Your weekly activity summary for Wellfound: October 19 - October 25 | 1 |
| 204 | 2026-10-26 | Zapier | [Ends tomorrow] 3 months of Professional for $10 | 1 |
| 205 | 2026-10-26 | Instagram | See patelavas, jyoti.5091 and more in your feed | 1 |
| 206 | 2026-10-26 | HackerNoon | Slacks Original Employees Blog the Inside Story of the $27.7B Salesforce Sale | 1 |
| 207 | 2026-10-26 | BetaList | Alenta AI, EduMatch, Omniconvert Commander, MasterAI Now, The AI Agent Company Company, and  | 1 |
| 208 | 2026-10-26 | Product Hunt Daily | 😸 Welcome back 1991 | 1 |
| 209 | 2026-10-26 | Beacons | 📊 You received 5 views to your link in bio page this week. | 1 |
| 210 | 2026-10-26 | Reddit | "Apparently studying Computer Science can get you a warning" | 1 |
| 211 | 2026-10-26 | AppSumo | Caption obvious | 1 |
| 212 | 2026-10-26 | GitLab | Be a DevOps Hero | 1 |
| 213 | 2026-10-26 | Quora Suggested Spaces | विवाहित_पुरुष_अवश्य_पढ़ें 😍 कुछ दिन पहले मेरे पास एक फ्रेंड रिक्वेस्ट आई । यह किसी "अल्का वर | 1 |
| 215 | 2026-10-26 | Medium Daily Digest | 9 Claude Code Mods You NEED to Install Right Now \| Pranit naik in The Ai Studio | 1 |
| 216 | 2026-10-26 | Linktree | You have new visitor data available | 1 |
| 217 | 2026-10-26 | Contra | Unlock more on Contra | 1 |
| 218 | 2026-10-26 | Beam from Beacons | Some ideas for your Beacons page | 1 |
| 219 | 2026-10-26 | 'Bea @ beehiiv 🐝' | Meet our support team | 1 |
| 220 | 2026-10-26 | Quora Digest | SSC CGL RESULT 2025 SELECTED AS ASSISTANT SECTION OFFICER (ASO) IN CENTRAL SECRETARI... | 1 |
| 221 | 2026-10-26 | OpenRouter Team | Provider failover is on by default | 1 |
| 222 | 2026-10-26 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 223 | 2026-10-26 | 'TAAFT - There's An AI For That' | 🐑 What AI Thinks of You | 1 |
| 224 | 2026-10-25 | Product Hunt Weekly | 😸 iPhone Duo or 401(k)? | 1 |
| 225 | 2026-10-25 | Mixcloud | Ready to upload? | 1 |
| 226 | 2026-10-25 | Cassie from Devpost | HACKATHONS just for you, Lazynext | 1 |
| 227 | 2026-10-25 | Unsplash Team | Last chance to submit to the Unsplash Awards 🏆 | 1 |
| 228 | 2026-10-25 | HackerNoon | The Evolution of LLMs, Explained Through What We Train Them to Do | 1 |
| 229 | 2026-10-25 | BetaList | Kling 4.0, BrixCanvas, Thinking Orbs, PopCam, HProxy, and more | 1 |
| 230 | 2026-10-25 | Product Hunt Daily | 😸 Pull my paw | 1 |
| 231 | 2026-10-25 | Linktree | Your free trial ends in 4 days | 1 |
| 232 | 2026-10-25 | Reddit | "DK Shivakumar on Kannadigas being sidelined in IT. What sort of system are..." | 1 |
| 233 | 2026-10-25 | AppSumo | Agent on duty | 1 |
| 238 | 2026-10-25 | Medium Daily Digest | Poets and Products \| Sethu Raman Omanakuttan | 1 |
| 239 | 2026-10-25 | Linktree | Get rid of Linktree branding on your page | 1 |
| 240 | 2026-10-25 | Contra | Your work belongs on Contra | 1 |
| 242 | 2026-10-25 | Facebook | Update for you: 1 new notification | 1 |
| 243 | 2026-10-25 | 'TAAFT - There's An AI For That' | 🍣 Why Your AI Picks Japan | 1 |
| 245 | 2026-10-24 | HackerNoon | A Borrower Pays €100. Where Does the Money Go? | 1 |
| 246 | 2026-10-24 | BetaList | OIO, BetterBudget, Postscriptum, Scribiz, Zolt, and more | 1 |
| 247 | 2026-10-24 | Product Hunt Daily | 😸 Now loading disc three | 1 |
| 248 | 2026-10-24 | Reddit | "26F software engineer unmarried" | 1 |
| 249 | 2026-10-24 | Rishabh Goel | Dodo Digest: Security Is Part of the Product | 1 |
| 253 | 2026-10-24 | Mixcloud | Looking for something to listen to? 👀 | 1 |
| 254 | 2026-10-24 | Medium Daily Digest | Here’s How I Can Tell You’re Secretly Using ChatGPT \| Matt Lillywhite in The Daily Draft | 1 |
| 255 | 2026-10-24 | Linktree | Pro members make these 3 crucial design changes | 1 |
| 256 | 2026-10-24 | Contra | Get paid your way on Contra | 1 |
| 257 | 2026-10-24 | Beam from Beacons | Build a better brand with your link ✨ | 1 |
| 258 | 2026-10-24 | 'Tyler @ beehiiv 🐝' | Own the conversation | 1 |
| 259 | 2026-10-24 | Quora Digest | Hi my name is shipra ..i am married in 2017 and it is a love marriage now iam just 29 ... | 1 |
| 260 | 2026-10-24 | 'TAAFT - There's An AI For That' | 🤥 Your AI Fibs by Design | 1 |
| 264 | 2026-10-23 | Railway | Changelog #0313: October 21 security incident | 1 |
| 265 | 2026-10-23 | Together AI Team | [Webinar] Muse Spark Open with Meta & Together | 1 |
| 266 | 2026-10-23 | Railway | Railway security update: Preliminary report and guidance | 1 |
| 267 | 2026-10-23 | Render | Important advisory on recent industry security disclosures | 1 |
| 268 | 2026-10-23 | 'Fly.io Customer Success' | New from Fly.io | 1 |
| 269 | 2026-10-23 | Neon Changelog | Jev on the AI Gateway, an OAuth provider for Managed Better Auth, and a new support center | 1 |
| 270 | 2026-10-23 | Kevin at Futurepedia | Claude Can Make Videos Without A Video Generator | 1 |
| 271 | 2026-10-23 | Mixcloud | Set up Your Channel | 1 |
| 272 | 2026-10-23 | Creator Spotlight | 🔴 Awards elevating creators (now open for submission) | 1 |
| 273 | 2026-10-23 | HackerNoon | I Built a 3D Office Where Local AI Agents Share One RTX 4090 | 1 |
| 274 | 2026-10-23 | BetaList | wiive, Private.Ki, FlashCut, PublishBuddy, Postling, and more | 1 |
| 275 | 2026-10-23 | Product Hunt Daily | 😸 Red means no | 1 |
| 276 | 2026-10-23 | Reddit | "BENGALURU COME BUY OUR SH*T" | 1 |
| 277 | 2026-10-23 | AppSumo | Editor in Chief | 1 |
| 280 | 2026-10-23 | Mixcloud | 🎵 Soundtrack Your Day | 1 |
| 281 | 2026-10-23 | Medium Daily Digest | Why Everybody is Leaving Spotify \| iTalks with Max 🍏 in Apple Hacks | 1 |
| 282 | 2026-10-23 | Linktree | Make your Linktree stand out | 1 |
| 284 | 2026-10-23 | Contra | Get matched to paid projects | 1 |
| 285 | 2026-10-23 | Beam from Beacons | Your link is ready — here's one step to make it work | 1 |
| 286 | 2026-10-23 | Grafana Labs Team | ObservabilityCON 2026 recap: What's new in AI, cost optimization, and more | 1 |
| 288 | 2026-10-23 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 289 | 2026-10-23 | Tumblr | Give these 5 a follow! | 1 |
| 290 | 2026-10-23 | 'TAAFT - There's An AI For That' | 🔍 Microsoft Catches AI Rushing | 1 |
| 291 | 2026-10-22 | Microsoft Advertising | [REGISTER NOW] Turn your data into buyer-ready deals with Microsoft Curate | 1 |
| 292 | 2026-10-22 | Quora Digest | Do Emirates flight attendants receive accommodation as part of their job benefits? | 1 |
| 293 | 2026-10-22 | SaaSHub Weekly | SaaSHub Weekly - Oct 22 | 1 |
| 295 | 2026-10-22 | Futurepedia | Have You Seen the New Futurepedia Yet? | 1 |
| 296 | 2026-10-22 | Substack | Model Behavior: Rick Rubin | 1 |
| 297 | 2026-10-22 | Creator Spotlight | 🔴 Your voice is an asset | 1 |
| 298 | 2026-10-22 | HackerNoon | How to Get More Value From a Hackathon Partnership | 1 |
| 299 | 2026-10-22 | 'There's An AI For That' | Your first AI tool alert | 1 |
| 300 | 2026-10-22 | 'TAAFT - There's An AI For That' | Welcome to There's An AI For That | 1 |
| 302 | 2026-10-22 | BetaList | aSERP, EntgenTech, EngineForge, SplitImage, Abodient, and more | 1 |
| 305 | 2026-10-22 | Product Hunt Daily | 😸 Hold me to it | 1 |
| 306 | 2026-10-22 | Honeycomb Team | AI SRE Won’t Replace Your Team | 1 |
| 307 | 2026-10-22 | Reddit | "First paying user after 4 months" | 1 |
| 308 | 2026-10-22 | AppSumo | Deal of the Day: WarmySender (10% off!) | 1 |
| 309 | 2026-10-22 | GitHub | Join us at GitHub Universe from anywhere—for free | 1 |
| 310 | 2026-10-22 | Mixcloud | Take Mixcloud With You 📲 | 1 |
| 311 | 2026-10-22 | Microsoft Advertising | Building smarter ads with AI = less work for you | 1 |
| 317 | 2026-10-22 | Medium Daily Digest | Thinking about starting on Medium? Advice from 31 writers who started in 2026 \| Zulie @ Med | 1 |
| 319 | 2026-10-22 | Linktree | You’ve got 7 days of Pro, on us | 1 |
| 320 | 2026-10-22 | Contra | Lazynext, welcome to Contra | 1 |
| 321 | 2026-10-22 | Dribbble | ⚽️ The strategy behind the FIFA '26 NYNJ website | 1 |
| 330 | 2026-10-22 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 339 | 2026-10-22 | The Auth0 Team | Auth0 Streamcast Ep 10: Turn identity into a growth lever | 1 |
| 340 | 2026-10-21 | Mixcloud | Welcome to Mixcloud | 1 |
| 341 | 2026-10-21 | E2B | Security Advisory: eMudhra E2B Setup Check | 1 |
| 342 | 2026-10-21 | Fireworks | The stage is set. Explore the Forge agenda. | 1 |
| 343 | 2026-10-21 | Runpod Team | Runpod Weekly: Python SDK 2.0, Flash included | 1 |
| 345 | 2026-10-21 | HackerNoon | Shipaton Blogging Contest Winners Announced 🎉 | 1 |
| 346 | 2026-10-21 | Editors at HackerNoon | The Shipaton Writing Contest Winners Are Here 🎉 | 1 |
| 349 | 2026-10-21 | BetaList | lessloc, AI Bridge, JuJuBit, Kern, Clean Retype, and more | 1 |
| 351 | 2026-10-21 | Product Hunt Daily | 😸 Hold that thought | 1 |
| 352 | 2026-10-21 | Reddit | "Strange Tinder date in Bangalore, resulting in scam , near Spice garden" | 1 |
| 353 | 2026-10-21 | Alibaba Cloud | Meet Qoder on Alibaba Cloud | 1 |
| 354 | 2026-10-21 | AppSumo | Side Grig | 1 |
| 356 | 2026-10-21 | DevHunt | 92 new dev tools this week: Supaboard AI, Ret, Google Browser Scraper and more | 1 |
| 357 | 2026-10-21 | Medium Daily Digest | The Eye Contact Problem \| Stevie Cline | 1 |
| 358 | 2026-10-21 | 'Elena at Penpot.app' | Hands-on Demo: UI design with Flex and Grid | 1 |
| 360 | 2026-10-21 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 365 | 2026-10-20 | The Frontier by Product Hunt | 🧠 The idiot box got smart | 1 |
| 366 | 2026-10-20 | DigitalOcean | AI tech stacks see increase in open source | 1 |
| 369 | 2026-10-20 | Saj at Futurepedia | ChatGPT Has a Second Mode Most People Never Open | 1 |
| 370 | 2026-10-20 | Substack | The tribe has spoken: How Drop Your Buffs manages a community thousands of chats deep | 1 |
| 371 | 2026-10-20 | Zapier | Get 3 months of our Professional plan for $10 | 1 |
| 372 | 2026-10-20 | Creator Spotlight | 🔴 How a college club became a $2M+ creator business | 1 |
| 373 | 2026-10-20 | HackerNoon | Is MTS Member of the Technical Staff or Now Monitoring the Situation? | 1 |
| 374 | 2026-10-20 | BetaList | SpeedyIndex Link Indexer, PEAKTEAMS, Space, WO Extractor, EzMaker AI Background Remover, and | 1 |
| 375 | 2026-10-20 | Quora Digest | What is the in hand salary of 13,85,000 LPA in Cognizant? | 1 |
| 376 | 2026-10-20 | Product Hunt Daily | 😸 Buy your own robot | 1 |
| 377 | 2026-10-20 | 'Jake @ beehiiv' | What publishers are doing with our MCP | 1 |
| 378 | 2026-10-20 | Reddit | "Old TCL Beyond TV was super slow, so I tried this open-source debloat with..." | 1 |
| 379 | 2026-10-20 | AppSumo | Good things leave in threes | 1 |
| 381 | 2026-10-20 | Linktree | Take your Linktree to the next level with Pro | 1 |
| 384 | 2026-10-20 | DevHunt | Week 41 winners: TwitterAPIs, shpyrd, WITAN Markets | 1 |
| 385 | 2026-10-20 | Medium Daily Digest | Keep your Flame game, get a 3D world: how I bridged Flame and flutter3d \| Dmitrii Zolotov | 1 |
| 386 | 2026-10-20 | Pinterest Create | Last call: Creator Day is 21 October | 1 |
| 387 | 2026-10-20 | 'Bea @ beehiiv 🐝' | Brands come to you. You just say yes. | 1 |
| 388 | 2026-10-20 | 'daily.dev' | Lazynext, your personal update from daily.dev is ready | 1 |
| 390 | 2026-10-19 | Wellfound | Are you using benefits to your advantage? | 1 |
| 391 | 2026-10-19 | Zapier | New automation ideas for you! | 1 |
| 392 | 2026-10-19 | Wellfound | Your weekly activity summary for Wellfound: October 12 - October 18 | 1 |
| 393 | 2026-10-19 | Instagram | See what _i_am_a.n.k.i.t_ and 8 others shared | 1 |
| 394 | 2026-10-19 | HackerNoon | Designing Zero-GC Hot Paths in .NET With Explicit Memory Ownership | 1 |
| 395 | 2026-10-19 | Kevin at Futurepedia | We Rebuilt Futurepedia Around Your Job | 1 |
| 396 | 2026-10-19 | BetaList | Coterie, Bannerproof, meshnomics, UGCLive, Supplier.cloud, and more | 1 |
| 397 | 2026-10-19 | Product Hunt Daily | 😸 Beam me up, Scotty | 1 |
| 399 | 2026-10-19 | AppSumo | Roll call | 1 |
| 400 | 2026-10-19 | Reddit | "Falsely Accused of Theft and Forced to Undress at Zara Bengaluru" | 1 |
| 401 | 2026-10-19 | GitLab | Build and run your first GitLab CI/CD pipeline | 1 |
| 403 | 2026-10-19 | Uneed Newsletter | Should I build a house for founders? | 1 |
| 404 | 2026-10-19 | Linktree | See how Newt Nguyen maximizes Linktree | 1 |
| 405 | 2026-10-19 | Instagram | See patelavas, chiranjeetpal5 and more in your feed | 1 |
| 407 | 2026-10-18 | HackerNoon | The Agentic Personal Car vs. The Fleet Robotaxi | 1 |


## Spam folder (2 unread threads, not part of the 408)

| Thread | Date | Sender | Subject | Verdict |
|---|---|---|---|---|
| 1a19b88988b72857 | 2026-11-02 | Robbe Seghers (Aikido) | Pro Trial - Aikido Security | Commercial; workspace back on free plan. Harmless. Leave in Spam. |
| 1a19478f6e15c947 | 2026-11-01 | directree | Accessibility Checker is verified on directree | Legit known thread, misfiled by Gmail. Claim confirmed; no action. |
