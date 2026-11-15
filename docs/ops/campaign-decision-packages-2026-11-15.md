# Campaign decision packages — 2026-11-15 (approved 2026-11-16)

`config:decision_enforce` is **approval**. Campaign sends need an **approved, unexpired** package whose `target` is `campaign:<id>` before `POST /api/v1/marketing/campaigns/:id/send` can proceed.

## Packages (UNLOCKED — send still deliberate)

| Package id | Target | Campaign | Outcome | Expiry | Decided by |
|------------|--------|----------|---------|--------|------------|
| **40** | `campaign:10` | `outreach-founder-perspective-2026-11-03` (draft, subscribed, opt_in) | **approved** | 2026-12-31 | `founder-continue-all` |
| **41** | `campaign:11` | `outreach-round2-2026-11-05` (draft, subscribed, **prospect**) | **approved** | 2026-12-31 | `founder-continue-all` |

Approved 2026-11-16 via `POST /decision/packages/{40\|41}/decide` with `{"outcome":"approved"}` under founder "continue all" (unlock only). Verified live: both `outcome=approved`, targets `campaign:10` / `campaign:11`, `expiry_at=2026-12-31T23:59:59.000Z` (unexpired).

## SEND still requires a separate deliberate action

Approving the package **only** clears the decision gate. It does **not** send mail.

- Do **not** call `POST /api/v1/marketing/campaigns/10/send` or `/11/send` (or Brevo blast) unless the founder explicitly asks to send.
- Dashboard Marketing → campaign Send, or an admin-scoped API send, remains a separate human step.
- Campaign 11 still has `consent_basis=prospect` — review audience fit before any send.

## Skipped (no new package)

- Campaigns **1–7, 9, 12** — already `sent`.
- Campaign **12** already has package **39** (`executed` / consumed).
- No cancelled campaigns in the table.

## Dashboard

Approved packages show on Governance → Decisions. Gate blocks for `campaign:10` / `campaign:11` should clear once send is attempted with these packages still approved and unexpired.
