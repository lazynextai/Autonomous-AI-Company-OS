# Lazynext — Marketing & Outbound Strategy (v0)

Status: actionable spec for the autonomous growth loop. Bounded by real
constraints — Brevo-only email (sender reputation is finite), Dodo **permanent
test mode** (founder decision 2026-09-29 — paid conversion is not the current
funnel; do not scale paid outbound), zero ad spend by default, and the product
has **no user accounts** (single-page app — no viral signup loops exist to exploit).
Historical “until Dodo live flip” language in earlier revisions is stale.

## Funnel mechanics (what already exists)

```
scan (report:*) → lead capture (/lead, 10/day/IP) → nurture seq (3 emails: now/+3d/+7d)
                                                        ↓
                              checkout.lazynext.com → 14-day trial → Pro (Dodo)
```

- `/api/v1/billing/funnel` aggregates every stage — measure before spending.
- `WELCOME20` (20% off, basis-points `2000`) is promised in email 3 — must
  exist in whatever Dodo mode is live.
- `sales_agent._draft_campaign` (4h) drafts ONE outreach campaign into
  `email_campaigns`; dashboard Marketing page fires it manually. Agent drafts,
  human sends — deliverability protection, keep it.

## Phase 0 — permanent test mode (free surfaces only)

Do NOT scale paid outbound — Dodo is permanently test-mode. Build owned/earned
distribution that compounds:

1. **GitHub Marketplace** — `action.yml` is shipped; list
   `Lazynext-AI/accessibility-checker@v1` publicly. Marketplace listing
   is the cheapest durable acquisition channel for a dev tool.
2. **npm/PyPI presence** — SDK packages are shipped; ensure listings carry the
   canonical `lazynext.com` + checker links (description keywords: WCAG,
   accessibility audit, ADA compliance).
3. **Content** — 2-3 technical posts (dev.to / Hashnode / Medium) on real
   differentiators: rendered keyboard-trap detection (2.1.2), focus-obscured
   (2.4.11), non-text contrast (1.4.11). Each ends on the free scan CTA.
   WCAG violation content ranks and converts better than generic a11y posts.
4. **Launch surfaces** — Product Hunt / Hacker News "Show HN" when a flagship
   story exists (the trap-detection story is the strongest hook — most
   scanners can't do it).
5. **SEO** — lazynext.com is already a working landing; ensure the free-scan
   CTA is above the fold and `sitemap` links resolve (2.4.5 fix shipped this).

## Phase 1 — if Dodo ever flipped live (outbound pilot) — intentionally excluded

Live flip is **intentionally excluded** (founder decision). Documented only as archived procedure:

Only after KYC + live creds + product/webhook/WELCOME20 recreated:

1. **Verticals ranked by lawsuit pressure**: SMB e-commerce, legal/finance,
   healthcare, agencies reselling compliance. ADA web-a11y suits target
   revenue-bearing SMBs who can't afford enterprise tools — that's the Pro
   tier's exact slot.
2. **Cadence**: sales-agent drafts → human review → send. Max 1 campaign
   live at a time (the draft gate enforces this). Keep volume under
   Brevo reputation-safe thresholds; a bought list would burn the domain —
   **never** import cold lists.
3. **Lead sources**: funnel leads (`lead:*`), CRM `crm_leads`, Product Hunt
  /GitHub traffic signups. Warm only.
4. **Compliance**: commercial email needs a **physical postal address**
   (CAN-SPAM/Brevo ToS) — now **populated** (`config:company_address` set to
   UNITED GLOBAL VENTURES PRIVATE LIMITED Bengaluru address, 2026-09-28; validity
   not reassessed). DKIM/SPF/DMARC (Brevo records) verified `verified:true`
   on 2026-09-28. See `docs/audit-2026-10-13/REPORT.md` §6.9.

## Metrics (query, don't guess)

- Funnel card on `/billing` dashboard: scan→lead→trial→sub ratios.
- `seq:last_run` + `brevo:events` audit for delivery health (bounces/suppress).
- `subs:active` + `billing:last_reconcile` for revenue truth.
- Kill criteria: any channel with >2% complaint/bounce → stop, protect the
  domain (Brevo will throttle the account anyway).

## Explicitly out of scope

- Paid ads (needs budget decision + live billing attribution).
- Cold-purchased lists, scraping, or volume blasting (kills the domain).
- Multi-product marketing until launchdeck ships.
- Referral/viral mechanics (no user accounts exist to bind them to).
