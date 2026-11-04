# Prospect qualification + university campaign draft — 2026-11-05

> ## READY-TO-SEND — AWAITING FOUNDER APPROVAL
>
> Nothing in this package has sent mail. `email_campaigns` **id 12** is `status='draft'`,
> `sent_count=0`, `sent_at=NULL`. No Brevo call, no webhook, no connector dispatch, no sequence
> touched. `email_contacts` is **unchanged at 49 total / 30 subscribed** — none of the 10 new
> prospects became sendable.
>
> **Read §5 before approving.** The five university addresses are *not* in `email_contacts`, and the
> `subscribed` segment today resolves to the 30 addresses campaign 9 already mailed. Adding the five
> without the procedure in §5.2 would re-mail the old list with university copy.

**Prepared by:** sales/marketing pass, 2026-11-05 (IST).
**Branch:** `feat/prospect-qualification` (docs + D1 data only — no worker code, no deploy).
**Prior context:** `docs/outreach/2026-11-05-prospecting.md` (the 10 rows, ids 73–82),
`docs/outreach/2026-11-03-outreach-drafts.md` (campaign format), `docs/outreach/2026-11-05-round-two.md`
(round-one results, id 11).

---

## 1. Scope of this pass

| Did | Did not |
|---|---|
| Qualified the 10 prospects (ids 73–82) and wrote `status` + ` | q:<score> <why>` to `notes` | Send any email |
| Created one draft campaign row (id 12) with body + UTM markers authored | Add any address to `email_contacts` |
| Documented the send-time procedure and the audit trail | Call Brevo, a connector, a webhook, or a sequence |
| | Deploy, change config, or touch protected files |

All D1 writes went through the internal `/query` and `/batch` bearer doors with bound parameters;
both doors write `episodic_events` `scope='query_audit'` rows, so the update and the insert are
traceable.

---

## 2. Qualification table (ids 73–82)

Score is 0–10 fit against the product ICP (WCAG scanner, free tier, $9/mo Pro, API/MCP/A2A,
monitoring). The `notes` column in D1 now carries the original evidence text plus
` | q:<score> <why>` — the same convention `SalesAgent._qualify_leads` writes.

| id | Email | Organisation | Old → New | Score | One-line reason |
|---:|---|---|---|---:|---|
| 73 | `info@m5designstudio.com` | M5 Design Studio (web agency) | `lead` → **`nurture`** | 5 | Agency channel fit, but `info@` is a sales inbox and no named accessibility owner. |
| 74 | `support@workworld.com` | Work World (e-commerce) | `lead` → **`nurture`** | 6 | Real ADA/EAA exposure, but `support@` is a general desk; no compliance function evidence. |
| 75 | `support@mcgeeandco.com` | McGee & Co. (e-commerce) | `lead` → **`nurture`** | 6 | Real ADA/EAA exposure, but `support@` is a general desk; no compliance function evidence. |
| 76 | `support@bellroy.com` | Bellroy (e-commerce) | `lead` → **`qualified`** | 7 | Large international DTC brand with a compliance function; genuine ADA/EAA exposure and budget. |
| 77 | `customercare@simplewishes.com` | Simple Wishes (e-commerce) | `lead` → **`nurture`** | 4 | Small DTC retailer, customer-care desk; WCAG exposure but no compliance owner or likely budget. |
| 78 | `accessibility@arizona.edu` | University of Arizona | `lead` → **`qualified`** | 9 | Dedicated accessibility office at a public university; statutory duty, named owner, real budget. |
| 79 | `digital.accessibility@austin.utexas.edu` | UT Austin | `lead` → **`qualified`** | 9 | Dedicated digital-accessibility role; statutory duty, named owner, real budget. |
| 80 | `accessibility@uh.edu` | University of Houston System | `lead` → **`qualified`** | 9 | System-wide digital-accessibility contact; statutory duty, named owner, real budget. |
| 81 | `accessibility@illinois.edu` | University of Illinois | `lead` → **`qualified`** | 9 | Dedicated accessibility office at a public university; statutory duty, named owner, real budget. |
| 82 | `accessibility@psu.edu` | Penn State University | `lead` → **`qualified`** | 9 | Dedicated accessibility office at a public university; statutory duty, named owner, real budget. |

### 2.1 Why the line falls where it does

- **Five universities → `qualified`.** Each address is a *role* mailbox (`accessibility@…` or
  `digital.accessibility@…`) published by an institutional accessibility office. That is the single
  strongest ICP signal available in this dataset: a legal duty (ADA Title II / Section 508 / EAA),
  a named owner whose job is the problem we solve, and an institutional budget. There is no
  competitor-suppression concern — these are buyers, not overlay vendors.
- **Bellroy → `qualified` (the only e-commerce row).** It is the one merchant in the batch large
  enough to plausibly run a compliance function (international DTC, published policy pages). The
  address is still a support desk, so the score is 7, not 9 — a reply may need routing.
- **Other e-commerce → `nurture`.** Work World, McGee & Co. and Simple Wishes have genuine WCAG
  exposure under the European Accessibility Act, but `support@`/`customercare@` is a general desk
  with no evidence of a compliance owner. Cold-pitching a support queue is how a domain gets
  flagged; they stay in the nurture bucket instead.
- **M5 Design Studio → `nurture`.** An agency is a potential *channel* (it builds client sites), not
  a direct buyer, and `info@` is a sales inbox. Worth a future partner-shaped note, not a cold
  product pitch.

---

## 3. Status distribution before / after

Live D1 (`SELECT status, COUNT(*) FROM crm_leads GROUP BY status`):

| status | before | after | delta |
|---|---:|---:|---:|
| qualified | 36 | **42** | +6 (5 universities + Bellroy) |
| nurture | 0 | **4** | +4 (M5, Work World, McGee, Simple Wishes) |
| lead | 10 | **0** | −10 |
| engaged | 15 | **15** | 0 |
| disqualified | 17 | **17** | 0 |
| **total** | **78** | **78** | 0 |

No row was deleted or inserted by this pass; `lead` is now empty again (it held exactly these 10).

---

## 4. The drafted campaign — `email_campaigns` id **12**

| field | value |
|---|---|
| id | **12** |
| name | `outreach-universities-2026-11-05` |
| subject | `A free WCAG 2.2 scan for university web teams` (45 chars) |
| status | `draft` |
| segment | `subscribed` (placeholder — see §5) |
| consent_basis | **`prospect`** (cold list — footer carries the published-email disclosure, no consent claim) |
| sent_count | 0 |
| sent_at | `NULL` |
| created_at | `2026-11-04T20:28:11.945Z` |

**Subject rationale.** It must not repeat campaign 9 (`Your site vs 75 accessibility checks — free
scan`) or campaign 11 (`A free accessibility scan (no signup, 75 checks)`), and it must speak to the
recipient's job rather than to their site. It names the standard (WCAG 2.2), the audience
(university web teams) and the cost (free), with no urgency, no em dash, no "Re:", and no claim
about their compliance. 45 characters keeps it intact on a phone.

**Body (stored HTML, verbatim from row 12 — the platform appends the footer at send time):**

```html
<p>Hi,</p><p>I'm with Lazynext, and I'll keep this short since accessibility is already your day job. We built a free checker for teams that want to verify pages without buying an enterprise audit platform: point it at any public URL and it runs 75 checks against WCAG criteria in a real browser — keyboard and focus behaviour, contrast, target sizes, headings, forms and ARIA — then gives you a score and a prioritized fix list, not a 400-page PDF.</p><p>There is no signup and no cost for the first scans — three a day per visitor — so your team can try it on whatever you are working on and decide for yourselves whether it is useful: <a href="https://checker.lazynext.com/?utm_source=email&amp;utm_medium=campaign&amp;utm_campaign=12">checker.lazynext.com</a>. The full check list is published at <a href="https://checker.lazynext.com/rules?utm_source=email&amp;utm_medium=campaign&amp;utm_campaign=12">/rules</a> if you want to compare it against your own testing matrix first.</p><p>If it fits your workflow, the same engine is available as a REST API, an MCP server and an A2A endpoint, plus a GitHub Action that can fail a pull request when the score drops. Daily monitoring rescans your pages and emails you when something regresses. Pro starts with a 30-day free trial, and the code WELCOME20 takes 20% off if you decide to keep it.</p><p>If accessibility is handled elsewhere on your campus, one line back is enough and I will note it — or use the unsubscribe link below and you will not hear from me again.</p><p>— The Lazynext team</p>
```

**Rendered plain text for approval:**

> Hi,
>
> I'm with Lazynext, and I'll keep this short since accessibility is already your day job. We built a
> free checker for teams that want to verify pages without buying an enterprise audit platform: point
> it at any public URL and it runs 75 checks against WCAG criteria in a real browser — keyboard and
> focus behaviour, contrast, target sizes, headings, forms and ARIA — then gives you a score and a
> prioritized fix list, not a 400-page PDF.
>
> There is no signup and no cost for the first scans — three a day per visitor — so your team can try
> it on whatever you are working on and decide for yourselves whether it is useful:
> checker.lazynext.com. The full check list is published at /rules if you want to compare it against
> your own testing matrix first.
>
> If it fits your workflow, the same engine is available as a REST API, an MCP server and an A2A
> endpoint, plus a GitHub Action that can fail a pull request when the score drops. Daily monitoring
> rescans your pages and emails you when something regresses. Pro starts with a 30-day free trial, and
> the code WELCOME20 takes 20% off if you decide to keep it.
>
> If accessibility is handled elsewhere on your campus, one line back is enough and I will note it —
> or use the unsubscribe link below and you will not hear from me again.
>
> — The Lazynext team

**UTM markers** are authored in the body (`utm_source=email`, `utm_medium=campaign`,
`utm_campaign=12`). The send path's `addCampaignUtm()` re-applies the same three keys to every
`checker.lazynext.com` link, so the authored markers are idempotent and a click back is provably
attributable to row 12.

**Footer** is appended by `marketingFooter(env, email, 'prospect')` — the published-business-email
disclosure, the signed `checker.lazynext.com/unsubscribe` link and the registered Bengaluru postal
block. **Not typed into the body.**

### 4.1 Claim-to-surface audit

| Claim in the copy | Surface that backs it |
|---|---|
| "75 checks against WCAG criteria" | `GET /rules` manifest — 74 WCAG criteria + 1 best-practice check, parity-tested |
| "in a real browser" | rendered scan path (`/render` trace: keyboard, focus, contrast, target size, headings, forms, ARIA) |
| "no signup and no cost … three a day per visitor" | free tier `rl:scan:<ip>:<day>` = 3; `/scan` is anonymous |
| "REST API, an MCP server and an A2A endpoint" | `GET /openapi.json` (OpenAPI 3.1), `POST /mcp`, `POST /a2a`, `/.well-known/agent.json` |
| "GitHub Action that can fail a pull request" | `action.yml` + `scripts/ci-scan.mjs` (`fail-under` / `fail-on`) |
| "Daily monitoring … emails you when something regresses" | `mon:` sweep, ≥10-point drop alert |
| "30-day free trial" | `config:trial_offer=30` (verified live 2026-11-05) |
| "WELCOME20 takes 20% off" | Dodo discount `WELCOME20`, 20% on the Pro product |

**No claim about their site.** There is no "your site fails", no score guess, no audit threat, no
compliance guarantee, no customer count, no price figure. The copy offers a tool and explicitly
invites them to judge it themselves — which is both the respectful and the legally safer framing.

---

## 5. Audience mechanics — read before sending

### 5.1 Where the five university addresses are

They are `crm_leads` rows 78–82 with `status='qualified'`. **They are not in `email_contacts`** and
they have no KV `unsub:` suppression key (verified: all five return `{"value":null}`). A campaign
send reads only `email_contacts` (`subscribed` segment) or `crm_leads.status='engaged'` (`engaged`
segment); there is **no `qualified` segment** in `campaignSegment()`.

### 5.2 The segment hazard (why "just add them" is unsafe)

If the five are added to `email_contacts` with `subscribed=1` on top of the current 30, the
`subscribed` segment becomes **35** and the send loops over all 35 — the 30 addresses already mailed
campaign 9 would receive the university copy. That is a mis-send, not a wider audience.

Two safe procedures exist; both are founder decisions:

1. **Surgical swap (no code change).** Before the send: set `email_contacts.subscribed=0` for the
   current 30 (`UPDATE email_contacts SET subscribed=0 WHERE subscribed=1`), insert the five with
   `subscribed=1`, fire the send (segment resolves to 5), then restore the 30 to `subscribed=1`.
   Every step is reversible and auditable, but it mutates 30 rows temporarily — do it in one
   supervised window, never alongside another campaign.
2. **Dedicated segment (code change, out of scope here).** Add e.g. a `universities` segment that
   resolves from `crm_leads` by `source='prospect-2026-11-05' AND status='qualified'`. Cleaner, but
   it is a worker deploy and violates this pass's "docs + D1 data only" constraint.

**Nothing was added in this pass.** `email_contacts` remains 49 total / 30 subscribed.

---

## 6. Send-time steps (only after founder approval)

1. **Approve** the subject and the body exactly as stored in row 12 (§4), and pick the audience
   procedure in §5.2.
2. **Confirm suppression is clean** — `GET /kv/get?key=unsub:<addr>` for each of the five returns
   `null` (verified 2026-11-05; re-check immediately before send).
3. **Apply the audience procedure** (surgical swap or new segment). If the surgical swap is chosen,
   verify `SELECT COUNT(*) FROM email_contacts WHERE subscribed=1` equals **5** before sending —
   if it reads 35, stop.
4. **Fire the send** — `POST /api/v1/marketing/campaigns/12/send` with a `write`-scope `lzk_` key
   (the dashboard's own key is `read,write`; the internal bearer is not accepted on `/api/v1/…`).
   Optional body `{"segment":"subscribed"}` is redundant unless the stored segment changed.
5. **Verify delivery** — `email_campaigns` id 12 must read `status='sent'`, `sent_count=5`,
   `sent_at` set; `email_events` should carry `tag` containing `campaign:12` for each recipient
   (`tag` stores a JSON string, so query with `LIKE '%campaign:12%'`).
6. **Restore state** if the surgical swap was used — set the original 30 back to `subscribed=1` and
   confirm the count returns to 30 plus any deliberately added rows.
7. **Log replies** per the handling plan in `2026-11-05-round-two.md` §5 — a reply appends to the CRM
   row (`| replied:<date>`) and promotes `status` to `engaged`; a decline sets `disqualified` and
   `subscribed=0`; "unsubscribe" is executed the same day via `POST /unsubscribe`.

---

## 7. Pre-flight checklist

- [ ] Founder approves the audience procedure in §5.2 (surgical swap vs new segment).
- [ ] Subject approved exactly: `A free WCAG 2.2 scan for university web teams`.
- [ ] Body approved exactly as stored in row 12, including "one line back is enough".
- [ ] Contact count verified **5** immediately before send (not 35).
- [ ] All five `unsub:` keys re-checked `null`.
- [ ] `config:trial_offer` still `30` — the copy promises 30 days.
- [ ] `config:company_address` still set — the footer postal block depends on it.
- [ ] Dodo test-mode acknowledged — the copy promises a trial and a discount; no payment is collected.
- [ ] Send window: Tue–Thu morning in the recipients' local time; one campaign per day.
- [ ] Reply capacity confirmed — someone can answer within one business day.
- [ ] Do **not** re-run `sales_agent._draft_campaign` — drafts 10, 11 and 12 exist, so the agent
      skips by design.
- [ ] Do **not** merge this branch's campaign into an existing send; row 12 is its own campaign.

**Governance note (honest finding).** `config:decision_enforce` is live at `approval`, but
`decisionGate()` has exactly two call sites — direct connector dispatch and scheduled social posts.
The campaign send loop calls `brevoSend` directly and is **not** gated. A campaign send is therefore
limited only by `write`-scope auth and Brevo credentials, not by a decision package. The round-two
doc's item 9 stated otherwise; that statement is inaccurate. This does not weaken the "human action"
rule — nobody has a send key in this package — but it should be fixed deliberately (wire
`decisionGate` into the campaign send) rather than assumed.

---

## 8. Verification (2026-11-05, live D1 + KV)

| Check | Result |
|---|---|
| `crm_leads` distribution | qualified 42 · disqualified 17 · engaged 15 · nurture 4 · lead 0 = **78** ✅ |
| Rows 73–82 | all 10 carry the new `status` and a ` | q:<score> <why>` suffix ✅ |
| `email_contacts` total | **49** — unchanged ✅ |
| `email_contacts` subscribed | **30** — unchanged ✅ |
| Any of the 10 in `email_contacts` | **0 rows** ✅ |
| Campaign 12 | `status='draft'`, `sent_count=0`, `sent_at=NULL` ✅ |
| `email_events` for campaign 12 | **0 rows** ✅ |
| KV `unsub:` for the five universities | all `null` ✅ |
| Brevo calls / connector dispatch / sequence | **none** ✅ |
| Deploys / config changes / protected files | **none** ✅ |

---

## 9. Blockers / open items

1. **Audience procedure is undecided** (§5.2). The five addresses cannot be mailed safely until the
   founder chooses the surgical swap or authorises a segment code change. This is the one gate
   between this draft and a correct send.
2. **Bellroy sits in `qualified` but is not in any campaign.** It is e-commerce, not a university; it
   needs its own copy, not this one. Left for a future merchant-shaped draft.
3. **Campaign send is not decision-gated** (§7 note) — a code gap, deliberately not fixed in a
   docs + data pass.
4. **Dodo stays in test mode** — trial and discount copy is truthful about what checkout serves, but
   no payment can be collected while it remains in test.
5. **Sending remains a human action.** Row 12 is a draft; nothing here calls a send endpoint, Brevo,
   a webhook, or a connector.
