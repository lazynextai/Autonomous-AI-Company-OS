# Prospecting round two — new audience for future outreach (2026-11-05)

> **List-building only.** NO email was sent, no Brevo call, no sequence enrolment, no
> `email_contacts` insert. `email_contacts` total stayed at **49** (30 subscribed) — nobody
> became sendable (verified below). This is the input for a *future* founder-approved round.

**Approved by founder:** item #0 — begin prospecting (the CRM audience was exhausted: 0 eligible
of 53 emailed-capable rows per `docs/outreach/2026-11-05-round-two.md` §3).

**Prepared by:** prospecting pass, 2026-11-05 (IST).
**Insert source tag:** `source = 'prospect-2026-11-05'` in `crm_leads`.

---

## 1. Target segments (reused ICP, no duplication)

| Segment | Who | Why |
|---|---|---|
| (a) Accessibility-adjacent digital agencies | web design/development studios that publish a business email | clients frequently need WCAG work; no overlay vendor |
| (b) E-commerce stores / SaaS | public `info@`/`support@`/`customercare@` on their own site | merchants face ADA litigation pressure; likely to care about WCAG |
| (c) Universities / colleges | published accessibility / web-team institutional contact | public institutions bought by Section 508 + ADA; institutional addresses only |
| (d) Non-profits / associations | general contact address | excluded this pass — most candidates published forms or personal addresses (see rejected list) |

**Excluded by rule:** accessibility-tool/audit competitors (UserWay, accessiBe, EqualWeb, AudioEye,
Siteimprove, Deque, Level Access, Allyant, BarrierBreak, TestPros, TestingXperts, Skynet, Gravoc,
Taoti, accessibility.build, d2i, Naspo, iwdagency, Outerbox, Mobilunity, Accessible.org, and any
vendor selling overlays/audits as core product), personal (`firstname@`), careers/jobs/press desks,
free-mail domains (gmail/yahoo/hotmail/outlook).

---

## 2. Discovery method

- Primary: `core/tools/search_tool.py::search_web` (Bing/DDG cascade; Serper key present but the
  cascade won on the queries tested) + Firecrawl MCP `firecrawl_search` (539 credits available) to
  surface contact/accessibility statements that *mention* a published address.
- Every accepted address was then **fetched and confirmed on the organisation's own domain** with a
  plain HTTP fetch (python `urllib`, real browser User-Agent, 2 s polite delay between requests);
  the raw page was scanned for the literal address. No address was inferred, guessed, or taken from
  a directory/aggregator.
- Unproven candidates were rejected at the verify step, not carried forward (see §5).

---

## 3. Accepted prospects — 10 rows (ids 73–82, `source='prospect-2026-11-05'`)

All emails literally present on the cited page and matching the organisation's domain.

| # | id | Organisation | Address | Segment | Evidence URL |
|---|---|---|---|---|---|
| 1 | 73 | M5 Design Studio | `info@m5designstudio.com` | (a) agency | https://m5designstudio.com/contact/ |
| 2 | 74 | Work World | `support@workworld.com` | (b) e-commerce | https://www.workworld.com/pages/contact-us |
| 3 | 75 | McGee & Co. | `support@mcgeeandco.com` | (b) e-commerce | https://www.mcgeeandco.com/pages/contact-us |
| 4 | 76 | Bellroy | `support@bellroy.com` | (b) e-commerce | https://bellroy.com/customer-care/contact-us |
| 5 | 77 | Simple Wishes | `customercare@simplewishes.com` | (b) e-commerce | https://simplewishes.com/pages/contact-us |
| 6 | 78 | University of Arizona | `accessibility@arizona.edu` | (c) university | https://accessibility.arizona.edu/ |
| 7 | 79 | University of Texas at Austin | `digital.accessibility@austin.utexas.edu` | (c) university | https://compliance.utexas.edu/programs/iaa/digital-accessibility |
| 8 | 80 | University of Houston System | `accessibility@uh.edu` | (c) university | https://uhsystem.edu/resources/digital-accessibility/contact-us/index.php |
| 9 | 81 | University of Illinois | `accessibility@illinois.edu` | (c) university | https://illinois.edu/about/accessibility/ |
| 10 | 82 | Penn State University | `accessibility@psu.edu` | (c) university | https://accessibility.psu.edu/ |

Notes column on each row carries the evidence URL + segment tag (`icp-a/b/c …`).

---

## 4. Verification facts

1. `SELECT COUNT(*) FROM crm_leads WHERE source='prospect-2026-11-05'` → **10**.
2. **Zero duplicates** — no inserted email exists elsewhere in `crm_leads` (only pre-existing NULL
   emails group with COUNT>1; no real email repeats), and no inserted domain matches any
   pre-existing `company` value.
3. **`email_contacts` unchanged** — total **49**, subscribed **30**, identical to the pre-insert
   baseline. No join between the new rows and `email_contacts` (empty result).
4. **Zero `unsub:` collisions** — none of the 20 suppression keys matches an inserted address.
5. No competitor, no personal address, no careers/jobs/press desk, no free-mail domain in the set.

---

## 5. Rejected candidates and why (proves the filter worked)

| Candidate | Address surfaced | Reason |
|---|---|---|
| Accessibility Innovations (accessibilityinnovations.com) | `info@accessibilityinnovations.com` | **Competitor** — sells website accessibility testing services as core product |
| eVero (evero.com) | `compliance@evero.com` | Could not confirm on fetch (address not in raw page; JS-rendered) — unverified, dropped |
| Holistic Web Solutions (holisticwebsolutions.co.uk) | — | Accessibility statement page returned no raw email — unverified, dropped |
| Studio Krista (studio-krista.com) | `projects@studio-krista.com` | Press-inquiry desk ("for all press enquiries reach out to…") — excluded desk |
| Island Eyecare (islandeyecare.ns.ca) | `info@islandeyecare.ns.ca` | Listed but page host is a small clinic; address marked but `accessibility@…` was **not** published in raw fetch — unverified, dropped |
| Colorado Technology Association (coloradotechnology.org) | `accessibility@coloradotechnology.org` | Appeared in search snippet; raw fetch of the cited page found no address — unverified, dropped |
| University of Chicago (uchicago.edu) | `hmp@uchicago.edu` | Page 200 but only a personal-style mailbox — not a general/office contact, dropped |
| University of Iowa (uiowa.edu) | — | No email in raw HTML — dropped |
| UNC Digital Accessibility (unc.edu) | — | 403 on fetch — unverified, dropped |
| University of Michigan (umich.edu) | — | 403 on fetch — unverified, dropped |
| University of Utah (utah.edu) | — | TLS failure (self-signed chain) — unverified, dropped |
| University of Washington (washington.edu) | — | TLS failure — unverified, dropped |
| ecopixel.com | — | Contact URL 404 — dropped |
| popwebdesign.net | — | Contact URL 404 — dropped |
| lively.com | `xxx@xxx.xxx` | Obfuscated/placeholder only — never insert an obfuscated address |
| Search hits naming universities via `gaskins@uhcl.edu`, `trand@uhd.edu`, `cwvhe@…`, `idhr.webmail@illinois.gov` | — | **Personal mailboxes / cross-org addresses** — excluded by the personal-address rule |

---

## 6. Final counts

| Metric | Value |
|---|---|
| Accepted and inserted | **10** (`crm_leads` ids 73–82) |
| Rejected at search/verify | **15+** candidates |
| `email_contacts` (sendable) | **unchanged: 49 total / 30 subscribed** |
| Emails sent | **0** |

Yield is honest: universities delivered reliably because institutional accessibility offices
publish role addresses; e-commerce/agency yield was lower because most publish contact forms only.
Ten solid, personally-verified rows is a defensible first batch — the same method can be re-run per
segment when a larger list is wanted.