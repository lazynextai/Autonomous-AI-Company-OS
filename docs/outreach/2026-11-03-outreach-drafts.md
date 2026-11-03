# Outreach drafts — 2026-11-03 (FOUNDER APPROVAL REQUIRED BEFORE ANY SEND)

**Status:** DRAFT ONLY. Two `email_campaigns` rows (`status='draft'`) inserted; nothing has been
sent, no Brevo call has transmitted anything, no sequence/webhook/connector was touched.
**Prepared by:** Sales/Marketing agent pass, 2026-11-03 (IST).
**Sender of record:** `support@lazynext.com` (Brevo, domain authenticated; DKIM aligned).

## 1. What the live data actually says (read-only audit, 2026-11-03 ~21:55 IST)

### `crm_leads` — all 68 rows by status

| status | rows | with a business email |
|---|---|---|
| qualified | 36 | 32 |
| engaged | 15 | 15 |
| disqualified | 17 | 6 |
| lead | 0 | 0 |
| nurture | 0 | 0 |

So the eligible surface (status ∈ qualified/engaged/nurture **and** a non-empty email) is **47
addresses**: 32 qualified + 15 engaged. The `nurture` and `lead` buckets are **empty** — the
serper seed has been fully drained into qualified/engaged/disqualified.

### Suppression (KV `unsub:`)

- **19** `unsub:*` keys exist in KV.
- **14 of them intersect the 47 eligible addresses** → excluded from every count below.
- The other 5 keys are operator/test addresses (`avas@lazynext.com`, `info-usa@taoti.com`,
  `contact@accessibility.build`, plus `conn-sweep-probe@example.com` and
  `suppression-check@example.invalid` probes).

### Post-suppression, test-artifact-cleaned audience

| bucket | eligible | − suppressed | − test artifact | **send-ready** |
|---|---|---|---|---|
| qualified | 32 | 28 | −1 (`engage-probe@example.invalid`, id 72) | **27** |
| engaged | 15 | 5 | 0 | **5** |
| nurture | 0 | 0 | 0 | **0** |
| **total (Variant A)** | 47 | 33 | 32 | **32** |

**Cross-check that the segment will actually match:** `email_contacts` has 49 rows, **32
subscribed** — and all 32 subscribed rows are the CRM-outbound contacts. The `subscribed` segment
therefore resolves to exactly these 32 addresses, and all 14 suppressed contacts are already
`subscribed=0` there. No drift between the list above and what the send loop would iterate.

### Existing `email_campaigns` rows (do not duplicate, do not modify)

| id | name | subject | status | sent | segment |
|---|---|---|---|---|---|
| 1 | Launch | We launched | sent | 2 | subscribed |
| 2 | brevo-live-test | Brevo live via worker | sent | 2 | subscribed |
| 3 | sales-outreach-2026-09-25 | Boost Your Website's Inclusivity with Accessibility Checker | sent | 48 | subscribed |
| 5 | sales-outreach-2026-09-28 | Make Your Website Accessible to All with Accessibility Checker | sent | 45 | subscribed |
| 6 | warm-trial-clickers-2026-09-28 | You checked out Accessibility Checker — your 30-day Pro trial is ready | sent | 9 | engaged |
| 7 | sales-outreach-2026-09-29 | Boost Your Website's Inclusivity with Accessibility Checker | sent | 34 | subscribed |
| 8 | sales-outreach-2026-09-29 | Make Your Website Accessible to All | **draft** | 0 | subscribed |

Notes: subject lines from ids 3/5/7 must **not** be reused (same list, same angle — a third
re-send of the same subject reads as spam). Id 8 is a stale Sept-28 draft that was never fired —
left untouched; the founder may delete or ignore it, but this package does not reuse it.

### Constraint that shapes the drafts

`campaignSegment()` in `worker/src/services.ts` accepts exactly **two** segments:
`subscribed` (`email_contacts WHERE subscribed=1` → 32) and `engaged`
(`crm_leads WHERE status='engaged'` → 15). There is **no `qualified` segment**. The send endpoint
also accepts a one-off `{segment}` override. Both drafts therefore carry `segment='subscribed'`
(the 32-address clean list) and the checklist below records the override options.

### Roadmap check (`docs/roadmap/`)

The three 2026-11-02/03 documents are internal governance only (decision packages, outcome ledger,
observer pass, decision gate staged at `human_only`). **Nothing there is customer-facing and
nothing is worth advertising in outreach.** One operational fact matters for the pre-flight: a
campaign send is classified `approval`-class, but the gate is armed at `human_only` only, so a
human-fired send is **not** blocked by `config:decision_enforce` today.

### Offer facts the copy is allowed to state (verified live, 2026-11-03)

- Free scan at `https://checker.lazynext.com` — rendered scan, no signup, 3 scans/day.
- 75-check ruleset (WCAG conformance criteria + one best-practice check) — `/rules` manifest.
- API + MCP (`/mcp`) + A2A (`/a2a`) + GitHub Action — live on `checker.lazynext.com` /
  `api.lazynext.com`.
- Monitoring: daily rescans + email alert on a ≥10-point score drop (3/day free, 10/day Pro).
- **Free Pro trial is currently 30 days** (`config:trial_offer=30`, founder decision 2026-09-28) —
  copy says 30 days, not 14.
- **`WELCOME20` = 20% off Pro** (Dodo discount code, restricted to the Pro product).
- **Dodo stays in test mode** (founder decision, permanent) — the copy makes no claim that a
  payment is charged; the trial + code are what checkout actually serves.

---

## 2. Variant A — "shipped-stack" (qualified + engaged · 32 addresses)

- **DB row:** `email_campaigns` id **9** — `outreach-shipped-stack-2026-11-03` (status `draft`,
  segment `subscribed`)
- **Subject:** `Your site vs 75 accessibility checks — free scan`

**Body (plain text as sent, footer appended automatically by the platform):**

> Hi,
>
> I'm with Lazynext. We built a free accessibility checker — you point it at any public page and it
> runs 75 checks against WCAG criteria in a real browser: keyboard and focus behavior, contrast,
> target sizes, headings, forms, ARIA. You get a score and a prioritized fix list, not a 400-page
> PDF.
>
> It's usable beyond the one-off scan now: there's a REST API and an MCP server, so your CI or your
> agents can run the same checks automatically, plus a GitHub Action that can fail a build when the
> score drops. Monitoring rescans your pages daily and emails you when something regresses.
>
> Try it free — no signup, three scans a day — at https://checker.lazynext.com. If you want the
> automation side, Pro starts with a **30-day free trial**, and the code **WELCOME20** takes 20% off
> if you decide to continue.
>
> If you reply with your URL, I'll send the full report for your site.
>
> — The Lazynext team

**Tone/claims audit:** every sentence maps to a shipped surface (rules manifest, `/mcp`, `/a2a`,
GitHub Action, monitor). No compliance guarantee, no "passes audits", no price figure, no claim of
customers or revenue. Subject is literal (it does 75 checks; the scan is free).

---

## 3. Variant B — "founder-perspective" (nurture · **0 addresses today**)

- **DB row:** `email_campaigns` id **10** — `outreach-founder-perspective-2026-11-03` (status
  `draft`, segment `subscribed` as placeholder)
- **Subject:** `We built a free accessibility checker — would love your take`

**Body (plain text as sent, footer appended automatically):**

> Hi,
>
> A short one from the founder side. We kept running into the same thing: accessibility audits are
> priced for enterprises, and most teams quietly skip them until something forces the issue. So we
> built the checker we wanted — it runs real WCAG checks in an actual browser (not an overlay
> script), shows you what's broken and in what order to fix it, and the first scans are free and
> anonymous at https://checker.lazynext.com.
>
> If it's useful, Pro adds daily monitoring and higher limits — 30-day free trial, and WELCOME20
> takes 20% off. If it isn't, I'd genuinely like to know what's missing; a two-line reply is enough.
>
> — Founder, Lazynext

**Audience reality:** there are **zero** `nurture` rows right now (and zero `lead` rows), so this
variant has **no send-ready audience**. It is drafted as the positioner for future nurture cycles
(`_qualify_leads` stamps new rows as `lead → nurture/qualified`), or for a founder-approved widening
to `subscribed`/`engaged` via the send-time segment override. **Do not fire it at the Variant A list
as a same-day second touch.**

---

## 4. Pre-flight checklist — every item needs founder sign-off before a send

1. **Audience.** Approve Variant A at 32 addresses (27 qualified + 5 engaged, post-suppression,
   test artifact removed). Approve or reject the two flagged rows:
   - `careers@usablenet.com` (id 12) — careers inbox, likely wrong desk.
   - `press@siteimprove.com` (id 37) — press inbox at a competitor (Siteimprove); the qualifier
     rule says never nurture a rival. Recommend removing both at the campaign level or accepting
     the noise.
2. **Variant B.** Confirm it stays unsent until nurture rows exist (today: 0), or explicitly
   authorize a segment override and audience.
3. **Segment.** Confirm `subscribed` (32, matches the audited list exactly) — or override to
   `engaged` (15) for a warm-only touch. There is no `qualified` segment; a qualified-only send
   needs a code change and is out of scope for this package.
4. **Subject lines.** Approve both exactly as written (ids 3/5/7 subjects must not be reused).
5. **Schedule.** Pick a send window — recommend Tue–Thu, 09:00–11:00 in the recipients' local
   morning, **one campaign per day maximum** and Variant B not on the same day as Variant A.
6. **Address list.** Read the 32 addresses in §5 against any do-not-contact list outside the KV
   suppression (e.g. inbound ticket opt-outs), and confirm none is a personal address.
7. **Suppression count.** Acknowledge 19 `unsub:` keys, 14 intersecting the eligible list, and that
   the send loop re-checks `unsub:<email>` per recipient anyway.
8. **Footer/consent.** `config:company_address` is the registered Bengaluru address and the
   `marketingFooter` + `List-Unsubscribe`/`List-Unsubscribe-Post` headers are appended
   automatically — confirm that is the intended legal block. (It is; no manual footer in the copy.)
9. **Billing truthfulness.** Dodo remains in test mode. The copy promises a 30-day trial and
   `WELCOME20` only — confirm you are comfortable inviting trial signups while payments stay test.
10. **Smoke test.** Fire one send to `support@lazynext.com` (or a seed address) and inspect the
    rendered footer + unsubscribe link before the list send. That smoke send is a human action.
11. **Governance.** Campaign sends are `approval`-class; the decision gate is armed at
    `human_only`, so a human-fired send is not blocked. No decision package is required for a
    human send today.
12. **Do not** re-run `sales_agent._draft_campaign` on top of this — a pending draft now exists, so
    the agent will skip; the two rows here are the deliverable.

## 5. The 32 send-ready addresses (Variant A, segment `subscribed`)

Qualified (27): `hello@accessibleweb.com`, `kris@accessible.org`, `hello@digitala11y.com`,
`info@addaw.org`, `partner@rsisecurity.com`, `sales@thriveagency.com`, `help@wcagpros.com`,
`security@boia.org`, `info@accesstive.com`, `flo@collegeboard.org`, `info@tabnav.com`,
`info@white-test.com`, `info@testdevlab.com`, `info@reciteme.com`,
`sales@coalitiontechnologies.com`, `support@superside.com`, `info@magnetoitsolutions.com`,
`info@freshysites.com`, `info@eastsideco.com`, `info@xovakstudio.com`, `contact@qikify.com`,
`info@folio3.com`, `widcommunications@wid.org`, `info@evoluted.net`, `info@a-listware.com`,
`media@jensenhughes.com`, `info@orizon.co`

Engaged (5): `careers@usablenet.com` ⚠, `support@testparty.ai`, `press@siteimprove.com` ⚠,
`info@aph.org`, `info@inclusiveweb.co`

Excluded by KV suppression (14): `contact@wcag.com`, `info@allyant.com`, `info@gravoc.com`,
`ce@naspo.org`, `communicationsteam@naspo.org`, `hello@skynettechnologies.com`,
`info@testpros.com`, `info@testingxperts.com`, `info@barrierbreak.com`, `info@d2itechnology.com`,
`info@accessible.org`, `hr@mobilunity.com`, `sales@outerbox.com`, `info@iwdagency.com`

Excluded as test artifact (1): `engage-probe@example.invalid` (crm_leads id 72)

## 6. Blockers / open items

1. **Variant B has no audience** — `nurture` is empty (0 rows). Either wait for new nurture rows or
   approve a segment override.
2. **Two flagged engaged rows** (careers@usablenet.com, press@siteimprove.com) — founder call.
3. **Dodo test mode** — trial/discount copy is truthful about what checkout serves, but no payment
   can actually be collected while it stays in test.
4. **Sending remains a human action.** Nothing in this package calls a send endpoint, Brevo, a
   webhook, or a connector.
