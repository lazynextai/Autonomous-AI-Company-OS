---
title: "Three times our own metrics lied to us (and how we caught it)"
published: true   # LIVE 2026-11-06 — https://dev.to/lazynext/three-times-our-own-metrics-lied-to-us-and-how-we-caught-it-p2h
tags: webdev, programming, devops, productivity
cover_image: ""
---

Our dashboard said our first outreach campaign hit a **43% open rate** with clicks within minutes. Our product showed **137 scans in 30 days**. Both numbers were wrong in the same direction: they were flattering.

Here's how each one lied, how we found out, and what we changed. If you run anything with analytics, email, or usage counters, you've probably got at least one of these in production right now.

## Lie #1: "opens" are mostly image proxies

Email "opens" are tracked with a 1×1 pixel. When a mail client loads images, the pixel fires. The problem: most major mail providers don't load images in the browser — **their servers do**, as a proxy, before (or without) a human ever seeing the message.

So your "open" can fire when:

- Gmail's image proxy fetches the pixel on receipt
- a corporate mail gateway detonates every URL in an inbound message to check it's safe
- a security scanner (Proofpoint, Mimecast, Barracuda and friends) walks the message

None of those are a person reading your email. We had 13 "unique opens" and I confidently reported them as engagement. The honest number was unknown — plausibly closer to zero.

**What to do instead:** treat opens as a *delivery* signal, not an attention signal. If you report them, label them. Ours now carry an explicit `opens_are_proxy_inflated: true` flag next to the count, so nobody downstream can quote the number as if it meant reading.

## Lie #2: our one "click" actually unsubscribed two real prospects

This one caused actual damage.

A click event came in on the unsubscribe link. We counted it as engagement — someone was interested! It wasn't. It was a mail scanner fetching every link in the message to detonate it.

Worse: our unsubscribe endpoint performed its state change on **GET**. So a scanner prefetching the link silently opted that recipient out. On our next campaign, two of five real recipients were unsubscribed within 20 seconds of delivery — before a human could possibly have read anything.

The bug was one line: the mutation ran for both GET and POST with no method guard.

```js
// before: both methods mutate
const r = await platform(env, '/unsubscribe', { method: 'POST', body: ... });
if (request.method === 'POST') return respond({ ok: r.ok });
return confirmPage("You're unsubscribed");  // GET already mutated

// after: GET renders a confirmation, only POST mutates
if (request.method !== 'POST') {
  return new Response(confirmPageHtml(email), { status: 200, headers: { 'content-type': 'text/html' } });
}
const r = await platform(env, '/unsubscribe', { method: 'POST', body: ... });
return respond({ ok: r.ok });
```

One detail that bit us: the confirmation page needs a `<form method="post">` with **no** `action` attribute, so it re-POSTs the current URL and keeps `email`+`sig` in the query string. No JavaScript needed. And if you set a strict CSP, remember `form-action` falls back to `default-src` — `default-src 'none'` will silently break your own submit button.

If you run marketing email, check this today: **can a GET unsubscribe someone?** Mail scanners are doing exactly that on your behalf.

## Lie #3: 94% of our "traffic" was us

Our product dashboard showed 137 scans in 30 days. Looked like traction. So I classified every single record by host:

| Source | Records | What it actually was |
|---|---:|---|
| Our own domain | 35 | A daily dogfood monitor on a 20-hour cadence |
| Our CI canary | 33 | GitHub Actions self-scans — 33/33 matched a workflow run |
| Pasted HTML payloads | 47 | Programmatic test traffic (5 scans in 0 seconds) |
| Reserved/example hosts | 10 | Fixtures |
| **Real external users** | **7** | ...and nothing since the previous week |

The real number was 7, not 137 — an **18.9× overstatement**. And with 7 real visits, "0 conversion" isn't a conversion problem; it's a sample size problem. That distinction completely changes what you should do about it.

**How we fixed it — and why it matters:**

If you can't tell your own traffic from a stranger's, every growth decision is guesswork. We added a source stamp at scan time, derived from route + client characteristics:

- `mcp` / `a2a` — the request came through an agent surface
- `monitor` — licensed caller, no client IP (our own sweep)
- `ci` — caller IP inside GitHub's published Actions ranges
- `fixture` — target isn't a real external site
- `web` — a real public request to a real external site
- `unknown` — everything else, honestly labelled

Two implementation notes worth stealing:

1. **GitHub's IP ranges are published as JSON.** Generate the table rather than hardcoding a /16 supernet — a coarse range produces false positives in both directions.
2. **Stamp the stored record, not the response.** Provenance is for later analysis; it shouldn't leak into your API contract.

## The pattern: flattering numbers have a shape

All three lies had the same structure — **something automated was being counted as something human**. Opens, clicks, visits. Each one inflated by machinery acting on its own.

The fixes were all the same shape too:

1. **Classify before you count.** Decide *who* did the thing, not just *that* it happened.
2. **Make the honest state visible.** A boolean like `corroborated: false`, or `cost_kind: "estimated"`, beats a number that quietly means something else.
3. **Never let a GET mutate.** Read and write should be different verbs, always — not just by convention, but in a way a dumb robot can't accidentally trigger.

## A cheap audit you can run this week

- Open your email analytics. If you can't tell whether an open was a proxy, your open rate is decoration.
- Curl your unsubscribe or confirm link with `HEAD` and `GET`. If either changes state, you have the bug above.
- Take your usage counter and group it by *source*: your own monitors, CI, tests, and strangers. You may find your "growth" was you.
- Check whether anything in your dashboard reports an estimate as if it were a measurement.

The uncomfortable part isn't finding the bug. It's realizing you already made decisions on the number, and told someone it was good news.

---

*Written while building a small accessibility-checking product. The scanner, the CI canary, and the inbox that taught us all of this are all real — the inflated numbers were too.*

---

## Publishing status (2026-11-06)

**PUBLISHED 2026-11-06 05:37 IST.**

- Live URL: https://dev.to/lazynext/three-times-our-own-metrics-lied-to-us-and-how-we-caught-it-p2h
- DEV article id `4984917`, `published_at` `2026-11-06T00:07:30Z`, tags `webdev, programming, devops, productivity`
- Published via `POST /api/articles` (HTTP 201) with a **newly generated** key. The two older keys (`.env` `DEVTO_API_KEY`, KV `conn:devto`) were revoked with the 2026-10-07 suspension and stayed 401 even after the 2026-11-05 reinstatement — DEV does not restore tokens with the account. The new key (description "Lazynext Platform Ops 2026-11", created in the signed-in session at `dev.to/settings/extensions`) is now in `.env` as `DEVTO_API_KEY`; `conn:devto` in KV still holds the dead token and should be updated if it is ever used.
- The internal "Publishing status" block below this heading was **stripped from the published payload** — ops notes must never ship to a public post.

**Rules check before publishing** (the account was banned for promotional content, so a second strike would likely be permanent):
- ~1,100 words of substantive technical content — teaching, not announcing
- No product links, no signup CTAs, no backlinks
- Only one mild author-line mention ("a small accessibility-checking product") for context
- Original: every finding is from our own production incidents
