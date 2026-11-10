# GitHub Star Lists — AdTech Batch (88/88 keys + 1 dupe + 2 profiles)

**Date:** 2026-11-10 (IST)
**Scope:** Every repository in the founder's new ~85-repo adTech/marketing batch — 91 list lines resolving to **88 unique `owner/repo` keys** (86 resolved, 2 × 404), 1 duplicate line, and 2 profile pages that are not repositories.
**Source list:** supplied by the founder (ad creative generation, Google marketing-solutions, Meta/MCP ads tooling, skills/markdown tooling, OpenChatCut cluster, video/audio generation, content-quality/anti-AI-slop, agent OS, plus profile links).
**Predecessor:** [github-star-list-full-idea-triage-2026-11-05.md](./github-star-list-full-idea-triage-2026-11-05.md) (35-repo full triage; same method, same vocabulary).
**Method:** authenticated `gh api repos/{owner}/{repo}` for every key (stars, forks, language, licence, archived, fork, size, `pushed_at`, open issues, description), then `gh api repos/{owner}/{repo}/readme` (base64, decoded) for README-level signals on all 86. No cloning. No source review beyond what each public README publishes. Two keys — `syedfahimdev/adgen` and `tzee27/AdsGenerator` — returned **404 Not Found** and are reported as such, not invented.
**Safety:** docs-only. No code changed, no product files touched, no external accounts opened, no signups, nothing deployed, nothing purchased. One branch, one PR, not merged.

---

## 1. How to read this document

This is an **idea map**, not a dependency list, and not a recommendation to copy code. Every repository is scored on one question: *does it contain a reusable idea that fits surfaces Lazynext already runs?*

Three honesty rules apply:

1. **README-level evidence is labelled.** Most of these repositories are prototypes with 1–3 stars, and several of the highest-starred are distribution funnels for paid hosted APIs, not engineering depth. A README claim is a claim. Where the only evidence is the README, the row says `README-only`. Where there is no README at all, the row says `NO README` — that is a finding.
2. **"Already covered" is not a compliment to the repo.** It means Lazynext independently shipped a stronger version. Several "impressive" repos here (33.8k★, 7.2k★, 3k★) are either funnels, copies, or products on runtimes we deliberately do not run.
3. **Licence is a first-class risk.** 29 of the 86 repositories have **no licence file at all** (_all rights reserved_), 7 are **AGPL-3.0**, 2 are **non-commercial-only**, 1 is **GPL-3.0**, and 1 is **Sustainable Use (fair-code)**. Only code with MIT/Apache/MPL may even be *considered* for reuse, and the house rule is ideas-only regardless. Section 16 covers this.

### Column key

| Column | Meaning |
|---|---|
| **Category** | What kind of thing the repo is (ad pipeline, model zoo, skill pack, funnel, copy of something else, etc.) |
| **Useful ideas / features / tools** | Only what the README actually demonstrates, in the repo's own terms |
| **Current Lazynext equivalent** | `Already have` / `Partial` / `Absent`, plus the concrete existing surface |
| **Disposition** | `already covered` · `build candidate` · `research-only` · `reject` |
| **Fit** | 0–5. 5 = high-leverage idea mapping onto shipped surfaces with a small shape. 0 = no defensible fit. |
| **Existing-surface notes** | Mapped to Workers / D1 / KV / Queues / Vectorize / Durable Objects / dashboard / connectors / MCP / A2A |
| **Risk flags** | `license` · `stack mismatch` · `external-provider gate` · `no code in repo` · `copy / duplicate` · `stale` · `archived` |
| **Why** | The one-line reason the disposition is what it is |

---

## 2. Coverage and counts

| Metric | Count |
|---|---:|
| List lines supplied | 91 |
| **Unique `owner/repo` keys** | **88** (86 resolved via API + 2 returning HTTP 404) |
| Duplicate lines (deduped to one row) | 1 (`janwilmake/openpolsia`, listed twice) |
| Keys that 404 (reported, not invented) | 2 (`syedfahimdev/adgen`, `tzee27/AdsGenerator`) |
| Profile/org pages that are NOT repositories | 2 (`github.com/Anil-matcha`, `github.com/PolsiaAI`) + 1 org-profile repo (`AdsTurbo/.github`, resolved, flagged in §11) |
| Rows in the master tables | 88 repo rows (§3–§11) + 2 profile rows (§12) = 90 scored rows |
| READMEs fetched and decoded | 86 (the 2 not-found repos have no README to fetch — none invented) |
| Rows marked `README-only` or `NO README` | 88 (3 with effectively no README: `AdsTurbo/.github`, `FireRedTeam/fireredteam.github.io`, `lo11233528/openchatcut-skills`) |

> Note on the cluster sizes: the prompt says "FireRedTeam ×20"; the list actually contains **21** FireRedTeam entries (lines 64–84), one of which (`fireredteam.github.io`) is the team's site repo, not a model repo. Counts below reflect the verified 21.

### Disposition split

| Disposition | Count | Meaning for the roadmap |
|---|---:|---|
| **already covered** | 3 | Lazynext already ships an equal-or-stronger version (ad-generator, meta-ads-stack, PolsiaAI/Polsia). No work. |
| **build candidate** | 4 | Real, small ideas worth building inside existing surfaces (Section 14). |
| **research-only** | 22 | Read for patterns and market reading. No build. |
| **reject** | 59 | Conflicts with a house rule, a licence, a runtime, or has no defensible idea. |
| **Total** | **88** | (86 resolved repos + 2 not-found keys) |

**That is the headline: 59 of 88 rows are rejects, 3 rows are already covered, and the 4 build candidates are the anti-AI-slop cluster plus three small idea extractions.** This batch is almost entirely ad-video pipelines that Lazynext cannot run (no GPU, no media product, no ad spend), copies, funnels, and unlicensed code.

### Fit distribution

| Fit | Count | Reading |
|---|---:|---|
| 5 | 1 | Direct product gap, small shape (impeccable) |
| 4 | 2 | Strong reusable idea (no-ai-slop, stop-slop) |
| 3 | 9 | Useful pattern, needs design |
| 2 | 12 | Positioning / research value only |
| 1 | 28 | Peripheral, or a single narrow lesson |
| 0 | 36 | No defensible fit |
| **Total** | **88** | |

### Licence distribution (exact, per repo)

| Licence | Count | Repos |
|---|---:|---|
| **MIT** | 29 | context-dot-dev/ad-maker · IamRamgarhia/OpenAdKit-Open-Source-AI-Marketing-Tool · DV0x/creative-ad-agent · Synter-Media-AI/ai-creative-agent · inba-web/ugc-ad-ai · Shree2604/Agentic-Ads · Anil-matcha/Open-AI-UGC · Manikant92/Narriq_Ads · creatify-ai/video-ad-generator · laxman-thedev/AI-Short-Video-Ads-Generator · TheMattBerman/meta-ads-kit · themagicmkt/sobe-tudo · Rakshath66/AdGen · attainmentlabs/meta-ads-mcp · irinabuht12-oss/google-meta-ads-ga4-mcp · Sandy-zippy/meta-ads-stack · iart-ai/ad-video-skills · fahmiaziz98/ad-generator · baiye12/ai-short-ad · AdsTurbo/adsturbo-creative-mcp · AdsTurbo/skill-adsturbo · AdsTurbo/product-page-to-ad-brief · prizmad/Prizmad-MCP-server · Anil-matcha/Open-Generative-AI · Kianzzz/book-sales-video · us-oyster/book-sales-video · FireRedTeam/Single-Trajectory-Distillation · petergyang/no-ai-slop · hardikpandya/stop-slop |
| **Apache-2.0** | 16 | google-marketing-solutions/scene-machine · google-marketing-solutions/gen-v · google-marketing-solutions/vigenair · SupercmoHQ/superCMO-skills · pbakaus/impeccable · yetone/kill-ai-slop · FireRedTeam/FireRed-OpenStoryline · FireRedTeam/FireRedASR · FireRedTeam/FireRedTTS2 · FireRedTeam/FireRed-Image-Edit · FireRedTeam/FireRedASR2S · FireRedTeam/FireRedVAD · FireRedTeam/FireRed-OCR · FireRedTeam/FireRedTTS3 · FireRedTeam/FireRedAudio · FireRedTeam/ReMatch |
| **AGPL-3.0** | 7 | 0xsline/OpenChatCut · pireel/pireel · sara-dev12/OpenChatCut · aiwithenoch/openchatcut-chatgpt · francize/codex-chatcut · NewbieCheng/today-no996-openchatcut · ZiAn-Su/OCC-ForAgent |
| **No licence file — all rights reserved** | 29 | jknoll/adflow · caoqc4/RemixKit · tengbot/aiads-skills · maviddoerdijk/AdFlowGen · AtlasCloudAI/atlas-marketing-studio · SamurAIGPT/amazon-product-studio · thegauravmahto/recast · janwilmake/openpolsia · PolsiaAI/Polsia · PolsiaAI/PolsiaAI · AdsTurbo/.github · Globussoft-Technologies/adsgpt-main · IuriiD/viral2viral · ujjwalredd/Autonomous-AI-Company-Operating-System · toby-bridges/openchatcut · lo11233528/openchatcut-skills · Binglesworth/openchatcut-image · lo11233528/openchatcut-andynocode-skills · hirclelili/tutorial-video-workflow · FireRedTeam/StoryMaker · FireRedTeam/LayerDiffuse-Flux · FireRedTeam/PhotoPoster · FireRedTeam/DynamicPose · FireRedTeam/InstanceAssemble · FireRedTeam/IVC-Prune · FireRedTeam/CQ-DINO · FireRedTeam/Target-Driven-Distillation · FireRedTeam/fireredteam.github.io · theadtya/ai-video-ad-generator |
| **NOASSERTION — GPL-3.0 text** | 1 | marek-kujda/ad-creative-generator (LICENSE file is GPL-3.0; metadata says NOASSERTION) |
| **NOASSERTION — non-commercial custom** | 2 | GML-MMGroup/AdCraft (Personal & Non-Commercial) · GML-MMGroup/ClipTalk (Non-Commercial Attribution) |
| **NOASSERTION — Sustainable Use (fair-code)** | 1 | tapankumarpatro/openframe-ai (`.ee` dirs enterprise-only) |
| **MPL-2.0** | 1 | FireRedTeam/FireRedTTS |
| **Total** | **86** | |

> **29 unlicensed + 7 AGPL + 2 non-commercial + 1 GPL + 1 fair-code = 40 of the 86 resolved repos are unsafe for any code reuse.** The only licences that even *permit* reuse are MIT (29), Apache-2.0 (16) and MPL-2.0 (1) — and the house rule is ideas-only even for those. Section 16 is the full policy.

---

## 3. Master table — Ad creative generation (22 rows, incl. 2 not-found)

| # | Repository | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 1 | [context-dot-dev/ad-maker](https://github.com/context-dot-dev/ad-maker) · 75★ · MIT · TypeScript | Paste a public domain → brand research (palette, type, tone, offers) → on-brand ad concepts *(README-only)* | **Partial:** campaign copy is drafted (`sales_agent._draft_campaign`) but no brand-research step exists. | **research-only** | 2 | Brand-extraction is a text-only step a Worker can do; generation needs an image model (absent). | none (MIT) · `stack mismatch: Next.js` | The "read a domain, extract brand tokens" idea is real and small; the ad-maker itself is not a surface we run. |
| 2 | [IamRamgarhia/OpenAdKit-Open-Source-AI-Marketing-Tool](https://github.com/IamRamgarhia/OpenAdKit-Open-Source-AI-Marketing-Tool) · 46★ · MIT · TypeScript | 18 generators, 11 optimizers, 9 LLM providers, browser-only BYOK; USPs itself as the open-source Jasper/AdCreative alternative *(README-only)* | **Partial:** one campaign-copy path exists; no generator catalogue or multi-provider BYOK UX. | **research-only** | 2 | A prompt-catalogue-as-data idea; we already draft copy. | none (MIT) · `stale: 2026-07` | The catalogue idea is a mild dossier improvement, not a product gap. |
| 3 | [DV0x/creative-ad-agent](https://github.com/DV0x/creative-ad-agent) · 130★ · MIT · TypeScript · 279MB | Hook-first methodology ("hooks = 80% of ad performance"); hooks mined from research with formulas; 6 concepts each on a different emotional trigger; session forking for A/B *(README-only)* | **Partial:** posts are drafted per-6h growth cycle; no hook-formula library or concept matrix. | **research-only** | 3 | Hook/trigger formula ideas can become rule data in a copy surface; image gen needs fal.ai (paid). | none (MIT) · `external-provider gate: fal.ai` | Hook-first is the strongest copy idea in the ad cluster; the rest is image/video. |
| 4 | [Synter-Media-AI/ai-creative-agent](https://github.com/Synter-Media-AI/ai-creative-agent) · 1★ · MIT · no code | "Recipe repo" pointing at a proprietary Synter MCP server (19 ad platforms, campaign creation on 14) *(README-only)* | **Absent.** | **reject** | 0 | No code to map. | `no code in repo` · `external-provider gate: Synter MCP (paid)` | Nothing here but a link to a hosted product. |
| 5 | [inba-web/ugc-ad-ai](https://github.com/inba-web/ugc-ad-ai) · 1★ · MIT · JavaScript | PERN-stack SaaS boilerplate claiming AI UGC ad creation; Clerk auth, PostgreSQL, marketing prose *(README-only)* | **Absent.** | **reject** | 0 | None. | `stack mismatch: PERN` · `business scope` | A stack template, not a defensible idea. |
| 6 | [marek-kujda/ad-creative-generator](https://github.com/marek-kujda/ad-creative-generator) · 3★ · GPL-3.0 · HTML | Figma plugin: CSV copy variations → text-layer permutations preserving styling *(README-only)* | **Absent:** no design pipeline. | **reject** | 1 | None. | `license: GPL-3.0 (copyleft)` · `stack mismatch: Figma` | Copyleft licence plus a design-tool runtime we will not run. |
| 7 | [GML-MMGroup/AdCraft](https://github.com/GML-MMGroup/AdCraft) · 659★ · **Personal & Non-Commercial** · Python | "From a rough idea to a finished ad": agentic video production pipeline, infinite canvas, Brand Professional mode *(README-only)* | **Absent.** | **reject** | 1 | None. | `license: non-commercial` · `stack mismatch: video render` | Licence forbids commercial use outright, and it is a video runtime. |
| 8 | [tapankumarpatro/openframe-ai](https://github.com/tapankumarpatro/openframe-ai) · 29★ · **Sustainable Use** · TypeScript | Fair-code multi-agent ad engine; cinematic fashion/luxury video ads; `.ee` source enterprise-only *(README-only)* | **Absent.** | **reject** | 1 | None. | `license: fair-code (non-commercial free tier)` · `stack mismatch: video` | Fair-code licences do not permit commercial use of the free tier. |
| 9 | [Shree2604/Agentic-Ads](https://github.com/Shree2604/Agentic-Ads) · 14★ · MIT · Python · stale 2025-10 | "Platform-perfect ads", multimodal, "completely free" *(README-only)* | **Absent.** | **reject** | 0 | None. | `stale: 2025-10` · `business scope` | Stale demo with claims but no mechanism. |
| 10 | [Anil-matcha/Open-AI-UGC](https://github.com/Anil-matcha/Open-AI-UGC) · 425★ · MIT · JavaScript | UGC video ads with "realistic AI actors", 4+ video models, powered by MuAPI; free open-source alternative to Arcads/MakeUGC *(README-only)* | **Absent.** | **reject** | 1 | None. | `external-provider gate: MuAPI (paid hosted API)` · `stack mismatch: video` | The repo is a funnel to a paid hosted API; 425★ is distribution, not depth. |
| 11 | [jknoll/adflow](https://github.com/jknoll/adflow) · 1★ · **no licence** · HTML · 161MB | Product page → Claude Agent SDK → Veo video ads *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stack mismatch: video` | No licence + a video pipeline with no surface. |
| 12 | [Manikant92/Narriq_Ads](https://github.com/Manikant92/Narriq_Ads) · 1★ · MIT · JavaScript | URL → 5s video ad; "predict ad performance" step *(README-only)* | **Absent.** | **reject** | 0 | None. | `business scope` · `stack mismatch: video` | A demo whose "predict ad performance" is an unsourced claim — exactly the metric class we refuse. |
| 13 | [syedfahimdev/adgen](https://github.com/syedfahimdev/adgen) · **404 NOT FOUND** | — `NO README` *(404 — nothing to read)* | — | **reject** | 0 | — | `404` | Repository does not exist (or is private/renamed). Reported, not invented. |
| 14 | [caoqc4/RemixKit](https://github.com/caoqc4/RemixKit) · 3★ · **no licence** · TypeScript | Upload a reference creative *you have the right to use*, analyse its marketing structure, generate variants with your own API keys; explicitly "not a tool for cloning other people's ads" *(README-only)* | **Absent.** | **research-only** | 2 | The rights-aware-remix framing is a good operating principle for our media store; the code is not reusable. | `license: none` · `stack mismatch: video` | The "have the rights first" discipline is the only transferable part (feeds candidate C3). |
| 15 | [theadtya/ai-video-ad-generator](https://github.com/theadtya/ai-video-ad-generator) · 2★ · **no licence** · JavaScript · stale 2025-06 | Product scraping + script gen + video composition (FFmpeg) for Shopify/Amazon/eBay/Etsy *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stack mismatch: video` · `stale` | No licence and a local FFmpeg pipeline. |
| 16 | [creatify-ai/video-ad-generator](https://github.com/creatify-ai/video-ad-generator) · 70★ · MIT · docs-only (21KB) | A **Claude skill**: hook formulas, script structures, multi-format strategy, A/B methodology, batch workflow — "usable without any API" *(README-only)* | **Partial:** copy drafted in campaigns; no shared framework playbook. | **research-only** | 3 | Pure knowledge artifact; hook/format ideas fit candidate C2's brief schema. | none (MIT) · `no code: docs/skill only` | The only repo in this cluster that is all transferable knowledge with zero runtime. |
| 17 | [maviddoerdijk/AdFlowGen](https://github.com/maviddoerdijk/AdFlowGen) · 1★ · **no licence** · Python · stale 2025-01 | Collects video assets; README admits pytube/ffmpeg are brittle and pinned *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stale` · `stack mismatch` | Abandoned script with broken pinned deps. |
| 18 | [laxman-thedev/AI-Short-Video-Ads-Generator](https://github.com/laxman-thedev/AI-Short-Video-Ads-Generator) · 9★ · MIT · TypeScript | Credit-based UGC generator: model image + product image → composite marketing image + short video via Gemini *(README-only)* | **Absent.** | **reject** | 0 | None. | `external-provider gate: Gemini/credit system` · `stack mismatch: video` | A paid-credit wrapper, not a mechanism. |
| 19 | [tzee27/AdsGenerator](https://github.com/tzee27/AdsGenerator) · **404 NOT FOUND** | — `NO README` *(404 — nothing to read)* | — | **reject** | 0 | — | `404` | Repository does not exist. Reported, not invented. |
| 20 | [Rakshath66/AdGen](https://github.com/Rakshath66/AdGen) · 13★ · MIT · TypeScript | Product URL (Amazon/Shopify) → GPT-4 script → Remotion video *(README-only)* | **Absent.** | **reject** | 0 | None. | `stack mismatch: video` · `external-provider gate: OpenAI` | A Remotion demo; no surface to run it on. |
| 21 | [fahmiaziz98/ad-generator](https://github.com/fahmiaziz98/ad-generator) · 4★ · MIT · Python | Multi-platform ad copy with 8 tones, streaming, product-aware, image gen *(README-only)* | **Already have:** campaign copy drafting (stronger, decision-gated). | **already covered** | 1 | Covered by `sales_agent._draft_campaign` + campaign send route. | none (MIT) | Tone-based copy generation is a weaker version of what we already run. |
| 22 | [baiye12/ai-short-ad](https://github.com/baiye12/ai-short-ad) · 2★ · MIT · no lang | Chinese short-video skill: 15–20s scripts, "five-dimension attention weight allocation", word-count overload detection with a degradation chain *(README-only)* | **Absent.** | **research-only** | 2 | The deterministic length/attention-budget idea is a copy-lint rule shape. | none (MIT) · `business scope: Douyin` | "Detect overload, degrade deliberately" is a small transferable lint idea. |

> Row 21 is this cluster's only `already covered` — the ad-copy generator genre is behind what we already run. Everything else with a real mechanism is video-generation on runtimes we do not run.

---

## 4. Master table — Google marketing-solutions (3)

Google-published but every README carries "**This is not an officially supported Google product**". Apache-2.0 throughout — ideas are free, but all three are GCP/Vertex/Veo-dependent.

| # | Repository | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 23 | [google-marketing-solutions/scene-machine](https://github.com/google-marketing-solutions/scene-machine) · 45★ · Apache-2.0 · TypeScript | Storyboard-driven generative video ad creation workbench on Google Cloud *(README-only)* | **Absent:** no video surface. | **research-only** | 2 | The storyboard-as-JSON idea is a schema pattern; nothing else maps. | `stack mismatch: GCP/Vertex` | Storyboard-first is a genuinely nice pipeline idea; its runtime is entirely out of scope. |
| 24 | [google-marketing-solutions/gen-v](https://github.com/google-marketing-solutions/gen-v) · 31★ · Apache-2.0 · Python · **ARCHIVED** | Veo video ads on Google Cloud, enhanced with product imagery *(README-only)* | **Absent.** | **reject** | 0 | None. | `archived` · `stack mismatch: GCP/Veo` | Archived and GCP-bound. |
| 25 | [google-marketing-solutions/vigenair](https://github.com/google-marketing-solutions/vigenair) · 243★ · Apache-2.0 · Python | Recrafting video ads with generative AI / Veo workflow recipes *(README-only)* | **Absent.** | **reject** | 1 | None. | `stack mismatch: GCP/Veo` | A recipes repo for a platform we do not run. |

---

## 5. Master table — Meta/MCP ads tooling (6)

| # | Repository | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 26 | [attainmentlabs/meta-ads-mcp](https://github.com/attainmentlabs/meta-ads-mcp) · 17★ · MIT · Python | MCP server for creating/managing Meta ad campaigns from Claude; self-managed with your own Meta app credentials *(README-only)* | **Partial:** `conn:meta` creates a single PAUSED ad via Graph API. No campaign/adset tooling via MCP. | **research-only** | 3 | Our `/mcp` surface could host a `meta_*` tool family — but it needs a Meta app + ad account + spend (founder-side). | `external-provider gate: Meta app + ad account` | The MCP-tool-shape idea fits our surface; the provider side is not unlocked. |
| 27 | [irinabuht12-oss/google-meta-ads-ga4-mcp](https://github.com/irinabuht12-oss/google-meta-ads-ga4-mcp) · 7.2k★ · MIT · no code | Claims 250+ tools for Google Ads/Meta/GA4/Search Console in one hosted MCP; **README is a sales page for Ryze AI** ($89/mo, 7-day trial) *(README-only)* | **Already have:** `/mcp` with tools, OpenAPI 3.1 with declared security, `llms.txt`, `/health` — self-hosted, no subscription. | **reject** | 0 | None. | `no code in repo` · `external-provider gate: paid hosted MCP` · `business scope: funnel` | 7.2k★ is SEO distribution, not engineering. It is a marketing funnel for a paid remote MCP we already replicate natively. |
| 28 | [TheMattBerman/meta-ads-kit](https://github.com/TheMattBerman/meta-ads-kit) · 352★ · MIT · Shell | Meta Ads Copilot: morning briefing, spend pacing, "find bleeders", "spot winners", fatigue detection, budget shifts *(README-only)* | **Partial:** weekly digest + ledger/briefings exist; no paid-ads insights read. | **research-only** | 3 | The *read-only performance briefing* idea fits `briefings`/`weekly_digest.py`; requires Meta insights access + spend. | `external-provider gate: Meta insights + ad account` | Best "ads operations" idea in the batch, and it is read-only — but there is no ad account to read. Feeds candidate C4 shape. |
| 29 | [Sandy-zippy/meta-ads-stack](https://github.com/Sandy-zippy/meta-ads-stack) · 5★ · MIT · Shell | "Skills are the brain, MCPs the hands, **you approve before a single dollar moves**" — 6 skills over Meta Ads MCP *(README-only)* | **Already have:** `decisionGate()` (approval-class dispatch) + 32 seeded approved packages + `config:decision_enforce=approval`. | **already covered** | 2 | The approve-before-money pattern is shipped in `worker/src/decisions.ts` + breakers. | none (MIT) · `external-provider gate: Meta` | The governance idea is already stronger here; the Meta side is inapplicable (no spend). |
| 30 | [prizmad/Prizmad-MCP-server](https://github.com/prizmad/Prizmad-MCP-server) · 1★ · MIT · JavaScript | MCP server turning a product URL into a platform-ready UGC video ad via the paid Prizmad service *(README-only)* | **Absent.** | **reject** | 0 | None. | `external-provider gate: paid SaaS` · `stack mismatch: video` | Thin adapter onto a paid service. |
| 31 | [AdsTurbo/adsturbo-creative-mcp](https://github.com/AdsTurbo/adsturbo-creative-mcp) · 2★ · MIT · TypeScript | Local MCP server for AI video ad planning; "no API key, no credits" *(README-only)* | **Absent.** | **reject** | 1 | None. | `external-provider gate: AdsTurbo ecosystem` · `stack mismatch: video` | Local-only planning tool with no distinct mechanism. |

---

## 6. Master table — Skills / markdown tooling (5)

| # | Repository | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 32 | [tengbot/aiads-skills](https://github.com/tengbot/aiads-skills) · 1★ · **no licence** · no code | Skill files for UGC ad copy, hooks, storyboards, translations, launch checklists *(README-only)* | **Absent.** | **reject** | 1 | None. | `license: none` · `no code: skills only` | No licence and no distinct idea beyond what creatify (MIT) already shows. |
| 33 | [SupercmoHQ/superCMO-skills](https://github.com/SupercmoHQ/superCMO-skills) · 303★ · Apache-2.0 · Python | Agent skills for end-to-end marketing campaigns: UGC videos, ad videos, product photography; source-consistent AI actors *(README-only)* | **Absent.** | **reject** | 1 | None. | `external-provider gate: paid media models` · `stack mismatch: video` | Requires paid image/video model stack; no media product to feed. |
| 34 | [AdsTurbo/skill-adsturbo](https://github.com/AdsTurbo/skill-adsturbo) · 1★ · MIT · Python | Python scripts + instructions for the AdsTurbo Open API (paid): spokesperson avatars, ad clone, cleanup, transform *(README-only)* | **Absent.** | **reject** | 0 | None. | `external-provider gate: paid AdsTurbo API` | A client for someone else's paid video API. |
| 35 | [AdsTurbo/product-page-to-ad-brief](https://github.com/AdsTurbo/product-page-to-ad-brief) · 2★ · MIT · JavaScript | Product page → core product read → 3 ad angles → 3 UGC scripts → 5-scene storyboard → generation prompt + **compliance notes for claims** *(README-only)* | **Partial:** campaign copy drafted; no structured brief or claims-notes step. | **research-only** | 3 | The structured-brief schema (angles/scripts/storyboard/compliance) maps to campaign metadata; the claims-notes step is a small rule. | none (MIT) | "Compliance notes for claims" is the single most transferable idea in the ad cluster — feeds candidates C1/C2. |
| 36 | [iart-ai/ad-video-skills](https://github.com/iart-ai/ad-video-skills) · 20★ · MIT · HTML | Agent skills to turn one motion-graphics template into batches of on-brand, A/B-testable ad creative *(README-only)* | **Absent.** | **reject** | 1 | None. | `stack mismatch: video/motion graphics` | Template-batching for video; no video surface. |

---

## 7. Master table — OpenChatCut cluster (11)

**What this cluster actually is:** [0xsline/OpenChatCut](https://github.com/0xsline/OpenChatCut) (3.0k★) is an open-source, **local-first, agent-native video editor** — a "ChatCut alternative" where Codex/Claude Code agents read, edit, and export real video projects (multitrack timeline + MCP + desktop installers), with fal.ai for image/video generation. It is **AGPL-3.0**. The rest of the cluster is: re-uploads of the upstream (sara-dev12, aiwithenoch, NewbieCheng — none are GitHub forks, they are copies), one archive of a Chinese review article (toby-bridges), one empty repo (lo11233528/openchatcut-skills), one private-cluster Docker packaging (Binglesworth), one stub (lo11233528/openchatcut-andynocode-skills), one pinned-upstream MVP with patch digests (francize), one hardened agent distribution (ZiAn-Su), and the upstream's renderer lineage (pireel, AGPL).

**Founder note (personally relevant):** the tab open at `localhost:5199` is OpenChatCut running locally. Using it as a **local tool** is fine and out of platform scope. What will not happen: vendoring it, embedding it, or building our own video editor — AGPL plus a desktop/video runtime that violates the Cloudflare-first rule. The cluster's *idea* worth keeping is "agents edit a structured project through MCP tools" — which is exactly the pattern of our `worker/src/mcp.ts` + dashboard surfaces, minus the video.

| # | Repository | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 37 | [0xsline/OpenChatCut](https://github.com/0xsline/OpenChatCut) · 3.0k★ · AGPL-3.0 · TypeScript | Local-first agent-native video editor: agents read/edit/export real, fully editable video projects through MCP; desktop installers; fal.ai integration *(README-only)* | **Partial:** MCP/A2A tool surfaces exist for text/scan/task; no video project model. | **research-only** | 3 | The agent-edits-a-structured-project-via-MCP pattern is ours already; the video model is not. | `license: AGPL-3.0` · `stack mismatch: desktop/Electron + video` · `business scope` | Genuinely good software the founder is using locally — and entirely outside platform surfaces. AGPL + desktop rules out integration. |
| 38 | [toby-bridges/openchatcut](https://github.com/toby-bridges/openchatcut) · 1★ · **no licence** · no code | Archive of a Chinese four-way comparison review of Pireel/OpenChatCut/ChatCut *(README-only)* | — | **reject** | 0 | None. | `no code in repo` · `license: none` | Not software. |
| 39 | [sara-dev12/OpenChatCut](https://github.com/sara-dev12/OpenChatCut) · 3★ · AGPL-3.0 · TypeScript | Re-upload of upstream OpenChatCut (identical README; not a GitHub fork) *(README-only)* | — | **reject** | 0 | None. | `copy: full upstream re-upload` · `license: AGPL-3.0` | Duplicate of row 37. |
| 40 | [aiwithenoch/openchatcut-chatgpt](https://github.com/aiwithenoch/openchatcut-chatgpt) · 1★ · AGPL-3.0 · TypeScript | Re-upload of upstream with ChatGPT wiring (identical README) *(README-only)* | — | **reject** | 0 | None. | `copy` · `license: AGPL-3.0` | Duplicate of row 37. |
| 41 | [lo11233528/openchatcut-skills](https://github.com/lo11233528/openchatcut-skills) · 1★ · **no licence** · **NO README (0 bytes)** | Empty repository. | — | **reject** | 0 | None. | `no code` · `license: none` · `NO README` | Nothing to evaluate. |
| 42 | [Binglesworth/openchatcut-image](https://github.com/Binglesworth/openchatcut-image) · 1★ · **no licence** · Dockerfile | Docker packaging of upstream for a **private cluster**; README says it "must not be exposed to the public internet" *(README-only)* | — | **reject** | 0 | None. | `license: none` · `business scope: private infra` | Someone else's private packaging. |
| 43 | [lo11233528/openchatcut-andynocode-skills](https://github.com/lo11233528/openchatcut-andynocode-skills) · 1★ · **no licence** · Python | Stub repo (31 bytes of README) *(README-only)* | — | **reject** | 0 | None. | `no code` · `license: none` | Nothing to evaluate. |
| 44 | [francize/codex-chatcut](https://github.com/francize/codex-chatcut) · 4★ · AGPL-3.0 · JavaScript | Unofficial MVP: OpenChatCut pinned to a commit, 7 host patches with a patch digest, verified in Codex Desktop *(README-only)* | **Absent.** | **research-only** | 1 | The pinned-upstream + patch-digest discipline is a supply-chain idea only. | `license: AGPL-3.0` · `stack mismatch: desktop` | The *packaging discipline* (pin, digest, verify) is the only transferable bit. |
| 45 | [NewbieCheng/today-no996-openchatcut](https://github.com/NewbieCheng/today-no996-openchatcut) · 1★ · AGPL-3.0 · TypeScript | Re-upload of upstream (identical README; fork=true) *(README-only)* | — | **reject** | 0 | None. | `copy` · `license: AGPL-3.0` | Duplicate of row 37. |
| 46 | [ZiAn-Su/OCC-ForAgent](https://github.com/ZiAn-Su/OCC-ForAgent) · 1★ · AGPL-3.0 · TypeScript | Hardened agent distribution: persistent local auth, reliable editor launch origins, **bounded skill loading**, recovery for orphaned edit sessions; upstream AGPL preserved *(README-only)* | **Absent.** | **research-only** | 2 | "Bounded skill loading" + orphan-session recovery are small ideas for our MCP/A2A dispatch hygiene. | `license: AGPL-3.0` · `stack mismatch: desktop` | Two genuinely small operational ideas; the runtime stays out. |
| 47 | [pireel/pireel](https://github.com/pireel/pireel) · 1.4k★ · AGPL-3.0 · TypeScript | Embeddable video editor component preserving the Pireel workbench; host supplies model/transcription/persistence *(README-only, verified AGPL-3.0)* | **Absent.** | **reject** | 1 | None. | `license: AGPL-3.0 (embed = network copyleft)` · `stack mismatch: video` | An *embeddable* AGPL component is the worst case: linking it into a distributed product triggers AGPL obligations. No media product exists to justify that. |

---

## 8. Master table — FireRedTeam model zoo (21)

All 21 are **research model repositories** (PyTorch + weights on Hugging Face): ASR, TTS, VAD, OCR, image editing, portrait animation, distillation, object detection, retrieval, and the team's site repo. They require GPU inference off-Workers and we operate no media product. **17 reject, 3 STT-adjacent research-only, 1 pipeline research-only.**

| # | Repository | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 48 | [FireRedTeam/FireRed-OpenStoryline](https://github.com/FireRedTeam/FireRed-OpenStoryline) · 3.7k★ · Apache-2.0 · Python | Storyline pipeline for media creation with an MCP server + built-in Claude Code/OpenClaw skills; storyboard → video *(README-only)* | **Absent.** | **research-only** | 2 | The agent-skills + MCP orchestration *shape* is the pattern; the media pipeline itself does not fit. | `stack mismatch: GPU/conda` · `business scope: video` | One of the few repos here with real orchestration substance; still a video product we do not have. |
| 49 | [FireRedTeam/FireRedASR](https://github.com/FireRedTeam/FireRedASR) · 2.0k★ · Apache-2.0 · Python | Industrial-grade ASR models (arxiv 2501.14350) *(README-only)* | **Absent:** no audio intake anywhere. | **research-only** | 1 | STT is the one plausible future capability (e.g. audio into tickets); Workers AI has no such model today. | `stack mismatch: GPU serving` | Model catalogue only; nothing serves it now. |
| 50 | [FireRedTeam/FireRedTTS2](https://github.com/FireRedTeam/FireRedTTS2) · 1.4k★ · Apache-2.0 · Python | Conversational TTS for podcasts/chatbots (arxiv 2507.11246) *(README-only)* | **Absent.** | **reject** | 1 | None. | `stack mismatch: GPU serving` | No audio output product. |
| 51 | [FireRedTeam/FireRed-Image-Edit](https://github.com/FireRedTeam/FireRed-Image-Edit) · 1.4k★ · Apache-2.0 · Python | Image editing models (v1/v1.1) *(README-only)* | **Absent.** | **reject** | 1 | None. | `stack mismatch: GPU serving` | No image product; our media store is upload/serve only. |
| 52 | [FireRedTeam/FireRedTTS](https://github.com/FireRedTeam/FireRedTTS) · 923★ · MPL-2.0 · Python | Streamable TTS-1S *(README-only)* | **Absent.** | **reject** | 1 | None. | `stack mismatch: GPU serving` · `license: MPL-2.0 (file-level copyleft)` | Same as TTS2. |
| 53 | [FireRedTeam/StoryMaker](https://github.com/FireRedTeam/StoryMaker) · 721★ · **no licence** · Python | Consistent characters in text-to-image *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stack mismatch: GPU` | No licence + no image product. |
| 54 | [FireRedTeam/FireRedASR2S](https://github.com/FireRedTeam/FireRedASR2S) · 736★ · Apache-2.0 · Python | All-in-one ASR (text + speech) system *(README-only)* | **Absent.** | **research-only** | 1 | Same STT-future note as FireRedASR. | `stack mismatch: GPU serving` | Model catalogue only. |
| 55 | [FireRedTeam/FireRedVAD](https://github.com/FireRedTeam/FireRedVAD) · 562★ · Apache-2.0 · Python | Voice Activity Detection / audio event detection *(README-only)* | **Absent.** | **research-only** | 1 | VAD is the natural companion to any future STT intake. | `stack mismatch: GPU serving` | Model catalogue only. |
| 56 | [FireRedTeam/FireRed-OCR](https://github.com/FireRedTeam/FireRed-OCR) · 296★ · Apache-2.0 · Python | OCR models, include word + line fonts, skewed and char-level recognition *(README-only)* | **Absent:** `/render` returns DOM, not pixels; no OCR step. | **reject** | 0 | None. | `stack mismatch: GPU serving` | OCR on screenshots is a plausible future scan feature, but nothing ingests pixels today and Workers AI lacks a vision-OCR model of this class. |
| 57 | [FireRedTeam/LayerDiffuse-Flux](https://github.com/FireRedTeam/LayerDiffuse-Flux) · 241★ · **no licence** · Python | Transparent-image generation via new VAE + LoRA on Flux *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stack mismatch: GPU` | No licence + no image pipeline. |
| 58 | [FireRedTeam/FireRedTTS3](https://github.com/FireRedTeam/FireRedTTS3) · 1.7k★ · Apache-2.0 · Python | Unified speech generation/editing TTS-3 (arxiv 2608.17492) *(README-only)* | **Absent.** | **reject** | 1 | None. | `stack mismatch: GPU serving` | No audio output product. |
| 59 | [FireRedTeam/PhotoPoster](https://github.com/FireRedTeam/PhotoPoster) · 205★ · **no licence** · Python | Two-stage pose-driven image generation *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stack mismatch: GPU` | No licence + no image product. |
| 60 | [FireRedTeam/Target-Driven-Distillation](https://github.com/FireRedTeam/Target-Driven-Distillation) · 112★ · **no licence** · Python | Distillation for acceleration *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stack mismatch: research` | Research artifact. |
| 61 | [FireRedTeam/DynamicPose](https://github.com/FireRedTeam/DynamicPose) · 85★ · **no licence** · Python | Pose-driven portrait animation (image-to-video) *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stack mismatch: GPU/video` | No licence + video. |
| 62 | [FireRedTeam/FireRedAudio](https://github.com/FireRedTeam/FireRedAudio) · 2.0k★ · Apache-2.0 · Python | General-purpose audio language model *(README-only)* | **Absent.** | **reject** | 1 | None. | `stack mismatch: GPU serving` | No audio product. |
| 63 | [FireRedTeam/InstanceAssemble](https://github.com/FireRedTeam/InstanceAssemble) · 45★ · **no licence** · Python | Layout-aware image generation (NeurIPS 2025) *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stack mismatch: GPU` | No licence + no image product. |
| 64 | [FireRedTeam/Single-Trajectory-Distillation](https://github.com/FireRedTeam/Single-Trajectory-Distillation) · 27★ · MIT · Python | Style-transfer acceleration by single-trajectory distillation *(README-only)* | **Absent.** | **reject** | 0 | None. | `stack mismatch: research` | Research artifact. |
| 65 | [FireRedTeam/IVC-Prune](https://github.com/FireRedTeam/IVC-Prune) · 18★ · **no licence** · Python | Vision-token pruning for LVLMs *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stack mismatch: research` | Research artifact. |
| 66 | [FireRedTeam/CQ-DINO](https://github.com/FireRedTeam/CQ-DINO) · 10★ · **no licence** · Python | Category-query object detection *(README-only)* | **Absent.** | **reject** | 0 | None. | `license: none` · `stack mismatch: research` | Research artifact. |
| 67 | [FireRedTeam/ReMatch](https://github.com/FireRedTeam/ReMatch) · 12★ · Apache-2.0 · Python | Multimodal retrieval representation matching *(README-only)* | **Partial:** Vectorize `company-knowledge` (384-d) retrieval exists. | **reject** | 1 | Retrieval models are embeddings; 384-d Workers Vectorize is intentionally simple. | `stack mismatch: 3B-model retrieval` | The idea is retrieval, which we already have at a scale-appropriate size. |
| 68 | [FireRedTeam/fireredteam.github.io](https://github.com/FireRedTeam/fireredteam.github.io) · 6★ · **no licence** · JavaScript · **NO README** | Team site repo (demos host). | — | **reject** | 0 | None. | `no code value` · `license: none` · `NO README` | Site repo. |

---

## 9. Master table — Video/audio generation, others (6)

| # | Repository | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 69 | [GML-MMGroup/ClipTalk](https://github.com/GML-MMGroup/ClipTalk) · 143★ · **Non-Commercial Attribution** · Python | Conversational video editing agent; TalkNet active-speaker detection *(README-only)* | **Absent.** | **reject** | 1 | None. | `license: non-commercial` · `stack mismatch: video` | Non-commercial licence + video runtime. |
| 70 | [Kianzzz/book-sales-video](https://github.com/Kianzzz/book-sales-video) · 242★ · MIT · Python | Chinese book-video skill: verify book facts → semantic storyboard → TTS → Pexels opening → AI images → bilingual subtitles → editable OpenChatCut draft; real audio duration aligns visuals *(README-only)* | **Absent** as a media pipeline; the *practice* (verify facts first; align to measured durations; keep editable fallback) matches our evidence/mission discipline. | **research-only** | 2 | Fact-verification-before-synthesis is our `evidence.ts`/unsourced-metric guard in another domain. | `business scope: video` · `stack mismatch: local tools` | Good operating practice, wrong product domain. |
| 71 | [us-oyster/book-sales-video](https://github.com/us-oyster/book-sales-video) · 2★ · MIT · no lang | Byte-identical re-upload of Kianzzz/book-sales-video (same size, same README) *(README-only)* | — | **reject** | 0 | None. | `copy: identical re-upload` | Duplicate of row 70. |
| 72 | [hirclelili/tutorial-video-workflow](https://github.com/hirclelili/tutorial-video-workflow) · 1★ · **no licence** · Python | Recoverable Codex orchestration: never mutate source media; generate an editable draft first; fall back to manual editing if the tool cannot write back *(README-only)* | **Partial:** task retry/escalation + phantom-completion veto exist on `task_log`; the "editable-draft-first" idea is a good task shape. | **research-only** | 2 | "Never mutate source; deliver an editable artifact; fall back cleanly" is a build-task principle we can reuse in task prompts. | `license: none` · `stack mismatch: video tools` | Good process idea; no licence; video domain. |
| 73 | [IuriiD/viral2viral](https://github.com/IuriiD/viral2viral) · 59★ · **no licence** · TypeScript | Upload a reference UGC ad → extract style/tone/pacing → generate a new ad from it *(README-only)* | **Absent.** | **reject** | 1 | None. | `license: none` · `stack mismatch: video` | Licence + video + "clone the winning ad" is a rights minefield (see RemixKit's honest opposite). |
| 74 | [thegauravmahto/recast](https://github.com/thegauravmahto/recast) · 12★ · **no licence** · TypeScript | Paste a viral Reel/Short/TikTok/Ad → on-brand script, hook, caption, visual direction via Gemini *(README-only)* | **Absent.** | **reject** | 1 | None. | `license: none` · `stack mismatch: video` | Licence + thin idea already covered by creatify's skill at 70★. |

---

## 10. Master table — Content quality / anti-AI-slop (4) — the highest-value cluster

These are the highest-starred repos in the batch (impeccable **107k★**) and the only serious build signal. Their shared idea: **a deterministic, id-less-rule table that flags machine tells (prose, UI, code) with stable rule ids, exit-code signalling, and ignore-with-reason** — which is architecturally the same engine as our own accessibility scanner (75 deterministic rules). The *pattern* transfers directly to a copy-quality gate over the copy we already generate and publish.

| # | Repository | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 75 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) · 107k★ · Apache-2.0 · Rust | 24 commands (steer/review/finish/iterate/plan); **slop detector: 62 deterministic rules, no LLM, no API key**; CLI `detect --list-rules`, exit code 2 = findings; `ignores add-value … --reason`; per-rule disable comments *(README-only)* | **Partial:** our scanner is already a 75-rule deterministic engine over web pages; nothing deterministic guards the *copy* we generate and send. | **build candidate** | 5 | The rule-table + ignore-with-reason + exit-code pattern maps onto `worker/src/copygate` (new), campaign send + social enqueue hooks, dashboard panel. | none (Apache-2.0) · `stack mismatch: Rust tool` | The single most transferable idea in the batch: deterministic, explainable quality rules with a review story. Feeds candidate C1. |
| 76 | [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) · 13.3k★ · MIT · Python | 20+ named prose slop patterns ("It's not X. It's Y.", "What nobody tells you is…") removed "without flattening your personal voice", as a skill *(README-only)* | **Partial:** same — no prose-quality rule set on outbound copy. | **build candidate** | 4 | Prose patterns become `slop-*` rules in the same `copygate.ts` rule table. | none (MIT) · `no code: skill only` | The slop-pattern catalogue is the ruleset content; MIT. |
| 77 | [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) · 18.8k★ · MIT · no lang | Skill with `references/phrases.md`, `structures.md`, `examples.md` — phrases to remove, structural patterns, before/after *(README-only)* | **Partial:** same. | **build candidate** | 4 | Priority ordering + before/after fixtures is exactly our `worker/test/*.test.mjs` fixture style for rules. | none (MIT) · `no code: skill only` | The best-structured pattern reference of the three; feeds C1's rule fixtures. |
| 78 | [yetone/kill-ai-slop](https://github.com/yetone/kill-ai-slop) · 1.4k★ · Apache-2.0 · TypeScript | A web field guide (33 AI-slop tells, before/after demos) **plus an agent skill that scans a web project for the code-level signals of each tell** and proposes fixes; site + skill in one repo *(README-only)* | **Partial:** our scanner scans pages for a11y; a sibling rule set could scan our own marketing/dashboard HTML for machine tells. | **build candidate** | 3 | The scan-the-project-for-code-signals idea pairs with our `/render` + static HTML surfaces. | none (Apache-2.0) | Reinforces C1 and adds the visual/UI-tell family; also a good pattern for dogfooding our marketing pages. |

---

## 11. Master table — Agent OS / other (9 + 1 org-profile repo)

| # | Repository | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 79 | [janwilmake/openpolsia](https://github.com/janwilmake/openpolsia) · 54★ · **no licence** · TypeScript · *(listed twice in the batch — deduped, one row)* | First-principles notes on Polsia's funnel: "wow moment" (research the person → deploy their landing page → tweet → email → docs → tasks); components list (Stripe Connect, task queue, Twitter, domain-wide email, docs, ads, chat) *(README-only)* | **Partial:** our onboarding wow is the free scan → report → CTA; parts of the wow sequence (docs, tasks) exist as briefings/tasks. | **research-only** | 3 | The "wow-moment sequencing" analysis is genuinely good reading on activation; no code to take. | `license: none` · `business scope: competitor analysis` | The best business article in the batch, not an integration. |
| 80 | [PolsiaAI/Polsia](https://github.com/PolsiaAI/Polsia) · 171★ · **no licence** · Python | Nine specialized agents (social, competitor research, outreach, ads, support, codegen, planning, finance, orchestration) over Claude Code CLI headless; nginx/frontend/backend *(README-only)* | **Already have:** fleet agents + connectors + task queue cover all nine roles at higher integration depth. | **already covered** | 2 | Role map is a subset of `agents/` + `CONNECTOR_IDS`; the "finance agent" is a ledger/briefing view here. | `license: none` · `stack mismatch: Claude-CLI monolith` | Competitive reference only — we are the stronger version on Cloudflare surfaces. |
| 81 | [PolsiaAI/PolsiaAI](https://github.com/PolsiaAI/PolsiaAI) · 48★ · **no licence** · no lang | Second Polsia repo (3KB, no code); README is a landing page: "AI that runs your company while you sleep", 800+ companies / $700K ARR badges *(README-only)* | — | **reject** | 0 | None. | `no code in repo` · `license: none` · `business scope: marketing claim` | A landing-page repo; the ARR/company-count badges are unsourced claims — the exact metric class we refuse. |
| 82 | [Anil-matcha/Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) · 33.8k★ · MIT · JavaScript | "Unrestricted" AI studio over 600+ models / 14 studios, powered by **MuAPI**; white-label-and-resell pitch *(README-only)* | **Absent:** no generative-media product; no media customers. | **research-only** | 2 | The star count is a distribution artifact (awesome-list + SEO + white-label funnel), worth reading as a *playbook*, not as engineering depth. | `external-provider gate: MuAPI (paid hosted API)` · `business scope` | The distribution mechanics behind 33.8k★ are the lesson; the product is a paid-API salad. |
| 83 | [SamurAIGPT/amazon-product-studio](https://github.com/SamurAIGPT/amazon-product-studio) · 21★ · **no licence** · JavaScript | Self-hostable Next.js SaaS for AI product photography / ad creative; Prisma/Postgres/Stripe/MuAPI, webhook-backed async delivery *(README-only)* | **Absent.** | **reject** | 1 | None. | `license: none` · `external-provider gate: MuAPI` · `stack mismatch: Postgres/Stripe` | No licence + a paid-API wrapper for a SaaS we do not sell. |
| 84 | [themagicmkt/sobe-tudo](https://github.com/themagicmkt/sobe-tudo) · 5★ · MIT · HTML | Open-source dashboard to launch Meta/Facebook ad campaigns with AI; bring-your-own keys *(README-only)* | **Partial:** `conn:meta` creates a PAUSED ad; no campaign-launch UI. | **reject** | 1 | A campaign-launch UI would only matter with ad spend, which is not approved. | `external-provider gate: Meta app + ad account + spend` | The idea needs a Meta app, an ad account, and money — all founder-gated. |
| 85 | [AtlasCloudAI/atlas-marketing-studio](https://github.com/AtlasCloudAI/atlas-marketing-studio) · 51★ · **no licence** · TypeScript | AI e-commerce ad studio: UGC ads, reference-ad remakes, drama ads, short skits, powered by Atlas Cloud (paid SDK) *(README-only — README badge says MIT but no LICENSE file exists)* | **Absent.** | **reject** | 1 | None. | `license: none (badge ≠ grant)` · `external-provider gate: Atlas Cloud` · `stack mismatch: video` | A badge claiming MIT with no LICENSE file is a red flag, not a grant. |
| 86 | [Globussoft-Technologies/adsgpt-main](https://github.com/Globussoft-Technologies/adsgpt-main) · 2★ · **no licence** · JavaScript | AdsGPT: LLM ad copy + real-time dashboard + Elasticsearch ad intelligence; **Autopilot** layer audits connected Meta accounts (auto-pause underperformers, scale winners, creative rotation) *(README-only)* | **Partial:** breakers + decision gate govern *our own* outbound; no ad-account audit loop. | **research-only** | 3 | The read-only half of Autopilot (audit, pause recommendations) matches the "read-only performance briefing" idea from row 28; spend moves stay decision-gated. | `license: none` · `external-provider gate: Meta` · `business scope` | Good spec of the autopilot idea; no licence, no spend, and the enforcement half must never be adopted ungated. |
| 87 | [ujjwalredd/Autonomous-AI-Company-Operating-System](https://github.com/ujjwalredd/Autonomous-AI-Company-Operating-System) · 8★ · **no licence** · Python | Historical provenance fork of the company OS (older Redis/Supabase/Chroma architecture) *(README-only)* | **Already have:** canonical repo is `lazynextai/Autonomous-AI-Company-OS`; Cloudflare-first. | **reject** | 1 | None — provenance link only. | `license: none` · `stack mismatch: superseded` | Same verdict as the 11-05 precedent: historical provenance, never an implementation source. |
| 88 | [AdsTurbo/.github](https://github.com/AdsTurbo/.github) · 1★ · **no licence** · no lang · **NO README** | Org profile metadata repo (1KB, README effectively empty) | — | **reject** | 0 | None. | `no code` · `license: none` · `NO README` · `org profile repo` | Org profile repo; nothing to evaluate. |

---

## 12. Profiles that are NOT repositories

| Entry | What it is | Note |
|---|---|---|
| [github.com/Anil-matcha](https://github.com/Anil-matcha) | User profile, **297 public repos** | Prolific publisher of "open-source alternative to X" front-ends that funnel into **MuAPI** (paid hosted generative-media API). The profile is a distribution engine. Two of its repos appear in this batch (Open-AI-UGC, Open-Generative-AI). Treat star counts from this account as distribution metrics, not engineering depth. No repo metadata to score — not a repository. |
| [github.com/PolsiaAI](https://github.com/PolsiaAI) | User account (NOT an org — `type: User`), 2 public repos, created 2026-03-18 | `PolsiaAI/Polsia` (171★) and `PolsiaAI/PolsiaAI` (48★) are **two distinct repositories** (different repo IDs 1185636692 / 1185638970 — verified; neither redirects to the other). The account bio claims "1,000+ companies ran autonomously" — an unsourced marketing claim. No repo metadata to score for the profile itself. |

> **Verification of the user's dup question:** `PolsiaAI/Polsia` and `PolsiaAI/PolsiaAI` are NOT duplicates and do NOT redirect — two separate repos sharing an account. `janwilmake/openpolsia` IS listed twice in the batch and is deduped to row 79 (it is itself a third, independent project, not a fork of PolsiaAI).

---

## 13. Coverage check

88 repo rows (rows 1–88 in §3–§11: 86 resolved repos + 2 not-found keys, each exactly once) + 2 profile rows in §12 = **90 scored rows**. 91 list lines − 1 duplicate line = 90 unique entries, matching the 88 repo keys + 2 profiles exactly. Every unique key appears exactly once.

---

## 14. Top build candidates (4 of a max 5)

Each candidate is deliberately small and extends something that already exists. None introduces a new runtime, a new datastore, or a paid provider. Order is by value-to-risk, not ambition.

### How the 4 candidates map to the 88 rows

| Candidate | Rows that feed it | Notes |
|---|---|---|
| **C1** Copy quality gate (slop + claims) | **75–78** (impeccable, no-ai-slop, stop-slop, kill-ai-slop) + **35** (compliance notes) + **22** (overload detection) | The rule-table-detector pattern is architecturally identical to our shipped a11y scanner — same class of engine, new domain. |
| **C2** Campaign creative brief (angles/hooks/storyboard as data) | **1** (brand read) · **16** (hook/format frameworks) · **3** (hook-first) · **35** (brief + compliance notes) | Structured brief + claims-notes recorded beside every campaign/social row. |
| **C3** Media rights ledger (rights_basis on every asset) | **14** (RemixKit "have the rights first") · **73/74** (the rights-minefield counter-examples) | Smallest possible shape: one KV meta field + one dashboard column. |
| **C4** Read-only paid-ads briefing (deliberately NOT an autopilot) | **28** (meta-ads-kit briefing) · **86** (adsgpt read-only half) · **29** (approve-before-money) · **26/84** (Meta MCP/launch) | Extends `conn:meta` with insights reads; every money-move stays decision-gated; scored lower because it needs an ad account + spend (external gate). |

All four are **independently specified**; C1 and C2 need only existing routes; C4 is explicitly gated on a founder decision (ad budget) that has not been made. None requires reading any repository's source, so the 40 unlicensed/copyleft repos do not block any candidate.

### C1 — Copy quality gate (deterministic slop + unsupported-claim rules) on outbound copy

| | |
|---|---|
| **Inspired by** | [impeccable](https://github.com/pbakaus/impeccable) (62 deterministic rules, rule ids, exit codes, ignore-with-reason) · [no-ai-slop](https://github.com/petergyang/no-ai-slop) + [stop-slop](https://github.com/hardikpandya/stop-slop) (prose pattern catalogues) · [kill-ai-slop](https://github.com/yetone/kill-ai-slop) (code-level tells) · [product-page-to-ad-brief](https://github.com/AdsTurbo/product-page-to-ad-brief) (claims/compliance notes) |
| **User value (founder)** | Our outbound copy (campaigns, social posts, briefings, marketing pages) is LLM-generated. Slop erodes a brand whose differentiator is *honesty about accessibility*; unsupported conformance claims (e.g. "WCAG compliant", "100% accessible") are a real legal/ethical risk in this space. A deterministic, no-LLM rule gate — the same engine class as our own scanner — catches both before copy reaches a human (or a send). |
| **Smallest implementation shape** | New `worker/src/copygate.ts`: a data table of rules (`slop-its-not-x-its-y`, `slop-future-not-coming`, `claim-unsupported-conformance`, `claim-vague-certification`, `overload-length`…), each with a regex/matcher and fixed message, plus an `ignores` record (rule id → reason) stored in KV `config:copy_ignores`. One internal route `POST /api/v1/copy/lint` (body = text) returns `{ok, findings:[{rule_id, message, span}]}`. Hook it into the **campaign send route** (`/api/v1/marketing/campaigns/:id/send`, right after the existing `decisionGate` check) and the **social enqueue** (`/api/v1/social/posts`) in a `warn` mode first, then flip to `block` mode per rule via KV after dogfooding our own marketing pages (which is also where kill-ai-slop's scan idea applies). Dashboard: a findings panel on the campaigns + feed pages via the existing `/api/svc` exact-path whitelist. |
| **Existing files / surfaces to extend** | `worker/src/services.ts` (send loop ~line 360 + social enqueue ~line 569) · new `worker/src/copygate.ts` · `worker/src/openapi.ts` (hand-maintained route table — add the lint path) · `worker/test/` (one positive + one negative fixture per rule, mirroring the deterministic-fixture style of the product scanner's tests) · `dashboard/app/(app)/campaigns` + `app/api/svc/route.ts` · KV `config:copy_ignores` |
| **Acceptance criteria** | ≥15 rules with one passing and one failing fixture each; campaign send in `warn` mode returns `findings` but does not block; in `block` mode returns 422 listing rule ids (message names the rule and the ignore decision); dogfood: 0 findings on our own shipped marketing pages after a deliberate cleanup pass; the lint route is listed in `worker/src/openapi.ts` (hand-maintained — the platform worker has no automated parity test, so this is a checklist item); no new provider, no new datastore, no LLM in the lint path. |
| **Dependencies** | None new — internal bearer token, existing send/enqueue routes, KV. |
| **Risks** | Rule false positives on legitimate copy — mitigated by warn-mode, ignore-with-reason, and shrinking the rule set before blocking. Missing a slop pattern is fine (deterministic ≠ complete); the point is a machine-checkable floor, exactly like our scanner. |
| **Effort** | **S** — 2–3 days including fixtures and dogfood cleanup. |

### C2 — Campaign creative brief (angle / hook / storyboard / compliance) as data beside every send

| | |
|---|---|
| **Inspired by** | [product-page-to-ad-brief](https://github.com/AdsTurbo/product-page-to-ad-brief) (angles/scripts/storyboard/compliance-notes schema) · [creatify-ai/video-ad-generator](https://github.com/creatify-ai/video-ad-generator) (hook formulas + A/B + batch frameworks, API-free) · [creative-ad-agent](https://github.com/DV0x/creative-ad-agent) (hook-first) · [ad-maker](https://github.com/context-dot-dev/ad-maker) (brand read first) |
| **User value (founder)** | Today a campaign row is `subject/html/segment`; the thinking behind the copy — angle, hook, audience, proof points, compliance notes — exists nowhere and dies with the draft. A structured brief makes copy reviewable before send, gives the decision gate real evidence when the founder approves a campaign, and is the natural home for C1's claims-notes. |
| **Smallest implementation shape** | One additive migration (014): nullable `brief TEXT` (JSON) on `email_campaigns` and `social_posts`. One route `POST /api/v1/copy/brief` that takes `{product_url?|notes}` and returns a brief via **Workers AI** (already bound): `{angle, hook, audience, proof_points, compliance_notes}`. Writing a brief is optional and never blocks; the campaign send route stamps `brief` + a hash into the existing decision package `evidence` field when present. Dashboard: brief shown beside subject/body on the campaigns page (read-only edit later). |
| **Existing files / surfaces to extend** | `db/migrations/` (014) · `worker/src/services.ts` (campaign insert + send) · new `worker/src/brief.ts` (Workers AI call + validation) · `worker/src/openapi.ts` · `dashboard/app/(app)/campaigns` · `worker/src/decisions.ts` (evidence field already exists) |
| **Acceptance criteria** | Brief JSON validates against a schema; missing `brief` on a send is a warning, never a block; brief hash lands in the decision package `evidence` array for approved sends; the route is listed in `worker/src/openapi.ts` (hand-maintained — no automated parity test on the platform worker); dashboard renders brief without breaking existing rows (null-safe). |
| **Dependencies** | Workers AI text-generation binding (live). |
| **Risks** | Workers AI brief quality varies — it is advisory metadata, not a gate. Claim-compliance notes must never be *generated* as fact: the blueprint stamps `compliance_notes` as "to be verified", and C1's claim rules are the verifier. |
| **Effort** | **S** — 2 days (migration + route + dashboard render). |

### C3 — Media rights ledger (`rights_basis` on every asset)

| | |
|---|---|
| **Inspired by** | [RemixKit](https://github.com/caoqc4/RemixKit) (the one repo in the batch that explicitly demands "a reference creative **you have the right to use**") and the counter-examples around it (viral2viral, recast: clone-the-winning-ad with no rights story) |
| **User value (founder)** | Our media library feeds public social posts (`image_url` is required for Instagram/Pinterest). Nothing records where an asset came from. In an ecosystem where "remix/remake" is the default, posting a derivative we do not have rights to is a real brand risk. One optional field turns an untracked store into an auditable one. |
| **Smallest implementation shape** | Extend the `media:{id}:meta` KV object (written at media upload, `worker/src/services.ts` ~line 636 — no migration needed) with `rights_basis`: `own` \| `generated_by_lazynext` \| `licensed` (with `license` + `source_url`) \| `unknown`. `POST /api/v1/media` accepts optional `rights_basis`/`license`/`source_url` (validated, never required); the media list route returns it; dashboard `/media` shows a badge and marks `unknown` in amber. The social dispatch path does **not** block on it (media can be genuinely authorless), but the audit trail now exists. |
| **Existing files / surfaces to extend** | `worker/src/services.ts` (media insert/list, `MEDIA_TYPES_*` block) · `dashboard/app/(app)/media` · `worker/src/openapi.ts` · docs/connectors media note |
| **Acceptance criteria** | Field round-trips through upload → list → dashboard; invalid enum values rejected (400); old rows render `unknown`, not blank or a lie; no dispatch-path behavior change (no new block); tests cover the enum and the passthrough. |
| **Dependencies** | None — pure KV metadata. |
| **Risks** | Minimal; the only risk is scope creep into a licensing workflow nobody asked for — keep it to the field + badge. |
| **Effort** | **S** — 1 day. |

### C4 — Read-only paid-ads briefing (explicitly NOT an autopilot)

| | |
|---|---|
| **Inspired by** | [meta-ads-kit](https://github.com/TheMattBerman/meta-ads-kit) (morning briefing, spend pacing, fatigue detection — read-only) · [adsgpt-main](https://github.com/Globussoft-Technologies/adsgpt-main) (Autopilot spec — **only its read-only half**) · [meta-ads-stack](https://github.com/Sandy-zippy/meta-ads-stack) (approve-before-money) |
| **User value (founder)** | If and when Lazynext ever tests paid ads, the first thing needed is a *weekly honest picture* (spend pacing, CTR, fatigued creatives) in the existing digest — not an autopilot that moves money. We already ship `conn:meta` (creates a **PAUSED** ad) and the weekly digest mechanism; this adds the read side and keeps every money-move behind the decision gate. |
| **Smallest implementation shape** | Extend the `meta` connector case in `callConnector` (`worker/src/services.ts` ~line 1890) to accept `campaign_id`/`objective`/`daily_budget` for creating a **PAUSED** campaign+adset+ad (still default-PAUSED; a `budget_approved` decision package becomes the ONLY way an unpause happens). Add internal read `GET /api/v1/connectors/meta/insights` (bearer) → `{spend, impressions, ctr, date_range}` via Graph API insights — read-only, no mutating call. Add an optional `meta:` section to `scripts/weekly_digest.py` that renders `unavailable` when no ad account is connected (same rule as every other digest figure). |
| **Existing files / surfaces to extend** | `worker/src/services.ts` (meta case + one read route) · `worker/src/decisions.ts` (existing approval classes cover any spend action) · `scripts/weekly_digest.py` · `worker/src/openapi.ts` · `docs/` ad-account setup note |
| **Acceptance criteria** | Insights route returns only read fields and never mutates; campaign creation keeps `status=PAUSED`; a non-`approval`-gated spend attempt returns the same decision-gate 503 shape as today; digest shows `unavailable` with zero ad account configured; tests cover the PAUSED-default invariant; **no autopilot behavior ships** — auto-pause/scale moves from adsgpt are explicitly excluded. |
| **Dependencies** | **External provider gate (scored lower for this):** Meta app with Marketing API access + an ad account with insights permission + real spend — all founder-side decisions that have NOT been made. Until then, the route 404s/`unavailable`. |
| **Risks** | Scope creep into the autopilot (auto-pause/spend moves) — the standing rule is that the decision gate and human approval must not be weakened; the autopilot half of adsgpt is in the "what NOT to build" list. Spend is a founder decision that nothing here pre-authorizes. |
| **Effort** | **M** — 3–4 days, but only starts once the founder says paid ads are a real experiment; otherwise it is a 404 with a good design. |

### Evaluated but not selected

| Candidate idea | Verdict | Reason |
|---|---|---|
| **Video ad generation pipeline** (any of the 40+ video repos) | **Never** | No GPU runtime, no media product, no media customers; every video repo with a real mechanism is on a runtime we do not run. See "What NOT to build". |
| **Meta ads MCP tool family** (rows 26/84) | **Later, folded into C4** | The MCP surface exists; the Meta app + ad account does not. C4 is the smallest honest first step. |
| **Autopilot for Meta accounts** (row 86) | **Never ungated** | Auto-pausing/scaling/creative-rotation without human approval violates the decision-gate and approve-before-money rules. |
| **ASR/VAD/STT intake for tickets** (rows 49/54/55) | **Later (research only)** | No audio intake exists; Workers AI has no model of that class; would need an external provider. Keep the FireRedTeam entries as the reference set if voice ever lands. |

---

## 15. Explicit rejects (59) — one-line reasons

Every `reject` row, in row order, with the single reason and the rule/licence/runtime that kills it. Rows with a defensible idea were dispositioned `research-only` and live in §3–§11; nothing below survives its gate.

| # | Repository | One-line reason | Killed by |
|---:|---|---|---|
| 4 | [Synter-Media-AI/ai-creative-agent](https://github.com/Synter-Media-AI/ai-creative-agent) | A README that points at someone else's paid MCP server. | `no code` + paid-provider gate |
| 5 | [inba-web/ugc-ad-ai](https://github.com/inba-web/ugc-ad-ai) | PERN-stack SaaS boilerplate with marketing prose. | `stack mismatch` (Postgres/Clerk) |
| 6 | [marek-kujda/ad-creative-generator](https://github.com/marek-kujda/ad-creative-generator) | Figma CSV→text-layer plugin. | **GPL-3.0** copyleft + Figma runtime |
| 7 | [GML-MMGroup/AdCraft](https://github.com/GML-MMGroup/AdCraft) | Agentic video production platform. | **Non-commercial licence** + video runtime |
| 8 | [tapankumarpatro/openframe-ai](https://github.com/tapankumarpatro/openframe-ai) | Fair-code cinematic ad engine (`.ee` source withheld). | **Sustainable Use (fair-code)** + video |
| 9 | [Shree2604/Agentic-Ads](https://github.com/Shree2604/Agentic-Ads) | Stale (2025-10) "completely free" ad demo. | `stale` + no mechanism |
| 10 | [Anil-matcha/Open-AI-UGC](https://github.com/Anil-matcha/Open-AI-UGC) | MuAPI funnel for AI-actor UGC videos. | Paid hosted provider + video |
| 11 | [jknoll/adflow](https://github.com/jknoll/adflow) | Product page → Veo video demo, 161MB. | **No licence** + video |
| 12 | [Manikant92/Narriq_Ads](https://github.com/Manikant92/Narriq_Ads) | URL → 5s video with a "predict ad performance" claim. | Unsourced metric + video demo |
| 13 | [syedfahimdev/adgen](https://github.com/syedfahimdev/adgen) | **404 — repository does not exist.** | `404` |
| 15 | [theadtya/ai-video-ad-generator](https://github.com/theadtya/ai-video-ad-generator) | Local FFmpeg video pipeline, stale 2025-06. | **No licence** + video |
| 17 | [maviddoerdijk/AdFlowGen](https://github.com/maviddoerdijk/AdFlowGen) | Abandoned script with brittle pinned pytube/ffmpeg. | **No licence** + `stale` |
| 18 | [laxman-thedev/AI-Short-Video-Ads-Generator](https://github.com/laxman-thedev/AI-Short-Video-Ads-Generator) | Credit-system UGC generator over Gemini. | Paid provider + video |
| 19 | [tzee27/AdsGenerator](https://github.com/tzee27/AdsGenerator) | **404 — repository does not exist.** | `404` |
| 20 | [Rakshath66/AdGen](https://github.com/Rakshath66/AdGen) | Remotion video demo fed by GPT-4. | Video runtime + OpenAI dependency |
| 24 | [google-marketing-solutions/gen-v](https://github.com/google-marketing-solutions/gen-v) | **Archived** Veo video workbench. | `archived` + GCP/Veo |
| 25 | [google-marketing-solutions/vigenair](https://github.com/google-marketing-solutions/vigenair) | Veo video-ad recipe collection. | GCP/Veo runtime |
| 27 | [irinabuht12-oss/google-meta-ads-ga4-mcp](https://github.com/irinabuht12-oss/google-meta-ads-ga4-mcp) | 7.2k★ README that is a **sales page** for a $89/mo hosted MCP; no code. | `no code` + paid fast-lane |
| 30 | [prizmad/Prizmad-MCP-server](https://github.com/prizmad/Prizmad-MCP-server) | Thin MCP adapter onto a paid UGC video SaaS. | Paid provider + video |
| 31 | [AdsTurbo/adsturbo-creative-mcp](https://github.com/AdsTurbo/adsturbo-creative-mcp) | Local-only video-ad planning MCP. | AdsTurbo ecosystem + video |
| 32 | [tengbot/aiads-skills](https://github.com/tengbot/aiads-skills) | Skill files for aiads.im, no engine. | **No licence** + skills-only |
| 33 | [SupercmoHQ/superCMO-skills](https://github.com/SupercmoHQ/superCMO-skills) | Skills requiring a paid image/video model stack. | Paid media models + video |
| 34 | [AdsTurbo/skill-adsturbo](https://github.com/AdsTurbo/skill-adsturbo) | Python client for the paid AdsTurbo API. | Paid provider |
| 36 | [iart-ai/ad-video-skills](https://github.com/iart-ai/ad-video-skills) | Motion-graphics template batching for video. | Video/motion runtime |
| 38 | [toby-bridges/openchatcut](https://github.com/toby-bridges/openchatcut) | Archive of a Chinese review article, not software. | `no code` + **no licence** |
| 39 | [sara-dev12/OpenChatCut](https://github.com/sara-dev12/OpenChatCut) | Full upstream re-upload (not a fork), no distinct idea. | **AGPL-3.0** + duplicate |
| 40 | [aiwithenoch/openchatcut-chatgpt](https://github.com/aiwithenoch/openchatcut-chatgpt) | Re-upload of upstream with ChatGPT wiring. | **AGPL-3.0** + duplicate |
| 41 | [lo11233528/openchatcut-skills](https://github.com/lo11233528/openchatcut-skills) | Empty repo (0 bytes). | `no code` + **no licence** |
| 42 | [Binglesworth/openchatcut-image](https://github.com/Binglesworth/openchatcut-image) | Docker packaging for someone's private cluster ("must not be exposed"). | **No licence** + private infra |
| 43 | [lo11233528/openchatcut-andynocode-skills](https://github.com/lo11233528/openchatcut-andynocode-skills) | Stub repo (31-byte README). | `no code` + **no licence** |
| 45 | [NewbieCheng/today-no996-openchatcut](https://github.com/NewbieCheng/today-no996-openchatcut) | Re-upload of upstream. | **AGPL-3.0** + duplicate |
| 47 | [pireel/pireel](https://github.com/pireel/pireel) | **Embeddable** AGPL video editor component. | **AGPL-3.0** (embed = network copyleft) + video |
| 50 | [FireRedTeam/FireRedTTS2](https://github.com/FireRedTeam/FireRedTTS2) | Conversational TTS models. | GPU serving + no audio product |
| 51 | [FireRedTeam/FireRed-Image-Edit](https://github.com/FireRedTeam/FireRed-Image-Edit) | Image-edit models. | GPU serving + no image product |
| 52 | [FireRedTeam/FireRedTTS](https://github.com/FireRedTeam/FireRedTTS) | Streamable TTS-1S. | GPU serving + **MPL-2.0** file-level copyleft |
| 53 | [FireRedTeam/StoryMaker](https://github.com/FireRedTeam/StoryMaker) | Consistent-character image generation. | **No licence** + GPU |
| 56 | [FireRedTeam/FireRed-OCR](https://github.com/FireRedTeam/FireRed-OCR) | OCR models. | GPU serving + no pixel-intake path |
| 57 | [FireRedTeam/LayerDiffuse-Flux](https://github.com/FireRedTeam/LayerDiffuse-Flux) | Transparent-image Flux LoRA. | **No licence** + GPU |
| 58 | [FireRedTeam/FireRedTTS3](https://github.com/FireRedTeam/FireRedTTS3) | Unified speech generation/editing. | GPU serving + no audio product |
| 59 | [FireRedTeam/PhotoPoster](https://github.com/FireRedTeam/PhotoPoster) | Pose-driven image generation. | **No licence** + GPU |
| 60 | [FireRedTeam/Target-Driven-Distillation](https://github.com/FireRedTeam/Target-Driven-Distillation) | Distillation research code. | **No licence** + research artifact |
| 61 | [FireRedTeam/DynamicPose](https://github.com/FireRedTeam/DynamicPose) | Portrait animation (image→video). | **No licence** + GPU/video |
| 62 | [FireRedTeam/FireRedAudio](https://github.com/FireRedTeam/FireRedAudio) | General audio-language model. | GPU serving + no audio product |
| 63 | [FireRedTeam/InstanceAssemble](https://github.com/FireRedTeam/InstanceAssemble) | Layout-aware image generation (NeurIPS). | **No licence** + GPU |
| 64 | [FireRedTeam/Single-Trajectory-Distillation](https://github.com/FireRedTeam/Single-Trajectory-Distillation) | Style-transfer acceleration research. | Research artifact |
| 65 | [FireRedTeam/IVC-Prune](https://github.com/FireRedTeam/IVC-Prune) | Vision-token pruning research. | **No licence** + research artifact |
| 66 | [FireRedTeam/CQ-DINO](https://github.com/FireRedTeam/CQ-DINO) | Object-detection research. | **No licence** + research artifact |
| 67 | [FireRedTeam/ReMatch](https://github.com/FireRedTeam/ReMatch) | Multimodal retrieval research (3B model). | 3B-model retrieval vs 384-d Vectorize |
| 68 | [FireRedTeam/fireredteam.github.io](https://github.com/FireRedTeam/fireredteam.github.io) | Team demo-site repo, no README. | `no code value` + **no licence** |
| 69 | [GML-MMGroup/ClipTalk](https://github.com/GML-MMGroup/ClipTalk) | Conversational video editor. | **Non-commercial licence** + video |
| 71 | [us-oyster/book-sales-video](https://github.com/us-oyster/book-sales-video) | Byte-identical copy of Kianzzz's repo. | Duplicate |
| 73 | [IuriiD/viral2viral](https://github.com/IuriiD/viral2viral) | Clone-the-winning-ad video generator. | **No licence** + rights risk + video |
| 74 | [thegauravmahto/recast](https://github.com/thegauravmahto/recast) | Viral-clip → ad script via Gemini. | **No licence** + thin (covered by row 16) |
| 81 | [PolsiaAI/PolsiaAI](https://github.com/PolsiaAI/PolsiaAI) | 3KB landing-page repo with "$700K ARR" badges. | `no code` + **no licence** + unsourced metric |
| 83 | [SamurAIGPT/amazon-product-studio](https://github.com/SamurAIGPT/amazon-product-studio) | Next.js product-photography SaaS over MuAPI. | **No licence** + paid provider + Postgres/Stripe |
| 84 | [themagicmkt/sobe-tudo](https://github.com/themagicmkt/sobe-tudo) | Meta campaign launcher requiring an ad account and spend. | Founder gate: paid ads not approved |
| 85 | [AtlasCloudAI/atlas-marketing-studio](https://github.com/AtlasCloudAI/atlas-marketing-studio) | E-commerce ad studio over the paid Atlas Cloud SDK; MIT badge but **no LICENSE file**. | **No licence** (`badge ≠ grant`) + paid provider + video |
| 87 | [ujjwalredd/Autonomous-AI-Company-Operating-System](https://github.com/ujjwalredd/Autonomous-AI-Company-Operating-System) | Historical provenance fork of our own OS (older Redis/Supabase stack). | **No licence** + superseded |
| 88 | [AdsTurbo/.github](https://github.com/AdsTurbo/.github) | Org profile repo, 1KB, no README. | `no code` + **no licence** |

**The 404s (reported, not invented):** `syedfahimdev/adgen` (row 13), `tzee27/AdsGenerator` (row 19).

**The duplicates flagged (verified):** `janwilmake/openpolsia` listed twice (deduped to row 79, `research-only`); `us-oyster/book-sales-video` is a byte-identical copy of `Kianzzz/book-sales-video`; `PolsiaAI/PolsiaAI` ≠ `PolsiaAI/Polsia` (two distinct repos, verified via API, different IDs); sara-dev12 / aiwithenoch / NewbieCheng / francize / ZiAn-Su are re-uploads or downstreams of `0xsline/OpenChatCut`.

**Deliberately not rejected but parked:** "build a video pipeline" and "run paid advertising" are un-decided business questions — they are recorded as absent with a founder gate, not as defects.

---

## 16. Licence and provenance policy

### 16.1 The rule (identical to the 11-05 precedent)

**Ideas may be reimplemented independently. Source may not be copied.** For every repository in this document: read the README and public documentation; write the idea down in our own words as a requirement with acceptance criteria — never as a diff, never as a translated file, never as a renamed copy; **no vendoring**; **no structure copying**; attribute the inspiration in the PR or design doc. All four candidates in §14 are independently specified and need no source code from any of these repos.

### 16.2 Licence classes in this batch — exact counts

| Class | Count | What may be done | What may not |
|---|---:|---|---|
| MIT | 29 | Ideas freely; code reuse technically permitted with notice — house rule is still ideas-only | Copying without licence text + notice |
| Apache-2.0 | 16 | Same, plus NOTICE/patent obligations if ever reused | Reuse without NOTICE handling |
| MPL-2.0 | 1 (FireRedTTS) | File-level copyleft: only modified files inherit obligations; still ideas-only here | Reuse without file-level obligations understood |
| **No licence file (all rights reserved)** | **29** | **Read the README for ideas only** | Any copying, adaptation, vendoring, or "port" |
| **AGPL-3.0** | **7** | **Read for ideas only** | Linking, vendoring, embedding, or running a modified copy against users |
| **GPL-3.0** | 1 (ad-creative-generator) | Read for ideas only | Copying into a proprietary product |
| **Non-commercial custom** | 2 (AdCraft, ClipTalk) | Read only | Any commercial use at all |
| **Sustainable Use (fair-code)** | 1 (openframe-ai) | Read only (`.ee` code not even licensed) | Commercial use of the free tier |

### 16.3 The AGPL question — and whether the postiz precedent transfers (it does NOT)

The postiz accepted-risk precedent (AGENTS.md) was: *unmodified upstream, self-hosted internally, not distributed, not part of the proprietary product*. **That reasoning does not transfer to pireel or OpenChatCut.** Reasons, stated plainly:

1. **Postiz was infrastructure serving us.** pireel is an *embeddable component* (its README is literally an `@pireel/editor` embed) and OpenChatCut is an end-user desktop app — distribution or embedding is the point, which is exactly what AGPL's network copyleft is designed to catch.
2. **We would not run them unmodified.** Any use would be modified/integrated, which in AGPL means the combined product's source must be offered. Our worker is proprietary-heavy; unwinding that is a real cost.
3. **The founder already runs OpenChatCut locally and that is fine** — local personal use of AGPL software imposes no obligations. What is forbidden is shipping it, embedding it, or serving a modified instance publicly. The `localhost:5199` tab stays a personal tool; it never becomes a product surface.

**The safe line:** these 7 AGPL repos (and all 29 unlicensed, 2 non-commercial, 1 GPL, 1 fair-code) are read-for-ideas-only. The 4 build candidates need nothing from them.

### 16.4 Star-count honesty (specific to this batch)

The five largest star counts split cleanly: **two are distribution artifacts** — `Anil-matcha/Open-Generative-AI` (33.8k★, MuAPI white-label funnel) and `irinabuht12-oss/google-meta-ads-ga4-mcp` (7.2k★, a Ryze AI sales page with no code) — while **three are substantive**: `pbakaus/impeccable` (107k★, real Apache-2.0 tooling), `hardikpandya/stop-slop` (18.8k★) and `petergyang/no-ai-slop` (13.3k★) (both skill-only but genuinely useful content). Star counts are treated as zero evidence of product fit; the licence and the mechanism decide.

---

## 17. What NOT to build (the tempting-but-wrong options)

1. **A video ad generation pipeline.** 40+ repos in this batch are this. We have no GPU runtime (Workers/Containers are CPU), no media product, and no media customers. Every candidate that would "just wire up an API for it" implies a paid video-model provider (fal.ai, Veo/Vertex, MuAPI, Atlas Cloud) and a new product nobody has asked for. Not buildable, not buyable cheaply, not wanted.
2. **An "autopilot" for ad accounts** (adsgpt's enforcement half). Auto-pausing, auto-scaling, creative rotation without human approval is the exact class of thing the decision gate exists to prevent. Nothing in this batch overrides house rule 6.
3. **Any "predicted ad performance" metric.** Manikant92's "predict ad performance" and PolsiaAI's "$700K ARR" badges are the same disease: unsourced figures. House rule 12: no fabricated data-bearing deliverables, no unsourced metrics.
4. **A white-label media studio** (MuAPI-model). It is a paid-API wrapper with a billing stack we intentionally keep in Dodo test mode and no customers to serve.
5. **Our own TTS/ASR/OCR.** 21 model repos scream "build the capability". There is no audio intake, no vision-into-pixels path, and Workers AI does not host these models. OCR-on-screenshots is the only contiguous idea and it is not requested.
6. **A second company-OS from PolsiaAI/openpolsia/Open-Generative-AI.** We already are the stronger version of the "nine agents" map, and openpolsia's roar is a business-notes article, not architecture.
7. **Paying for any of these.** AdsTurbo (paid API), Prizmad (paid), Ryze AI ($89/mo), MuAPI/Atlas (hosted API) — all are paid fast-lanes/subscriptions. House rule: no paid signups for capabilities we already have natively.

---

## 18. Blockers, limits and what this document does not claim

### Blockers

| Blocker | Owner | Effect |
|---|---|---|
| No founder decision on paid ads | Founder | C4 stays a design; no ad account, no spend, no unpaused campaign. |
| 40/86 repos licence-unsafe | Legal/ops (informational) | Ideas-only for 40 repos; none of the four candidates depends on any of them. |
| FireRedTeam model weights may carry separate licences | Research | Code may be Apache-2.0 while weights on Hugging Face are not — we did not audit weight licences; irrelevant while nothing is adopted. |
| README-only evidence | Research | Maturity claims from these repos are unverified. Do not cite them as benchmarks. |

### What this document does not claim

- It does **not** claim any repository is production-ready, well-tested, or safe to depend on — only what its README says.
- It does **not** claim Lazynext is missing nothing; it claims that **these 86 repositories offer 4 buildable ideas**, and that the batch's real value is a licence-and-scope object lesson (40/86 licence-unsafe, an overwhelming majority of the batch ad-video pipelines we cannot run, and 4 genuinely reusable anti-slop patterns).
- It does **not** recommend copying code from any repository, including the permissively licensed ones.
- It does **not** change code, deploy anything, or touch any external account.

### Verification performed

| Check | Result |
|---|---|
| Metadata fetched for every key via `gh api repos/{owner}/{repo}` | 86 resolved, 2 × **404** (reported as rows 13/19) |
| README fetched + decoded for every resolved repo | 86; 3 empty (`AdsTurbo/.github`, `fireredteam.github.io`, `lo11233528/openchatcut-skills`) |
| Duplicate list lines | 1 (`janwilmake/openpolsia`) — deduped, noted |
| PolsiaAI/Polsia vs PolsiaAI/PolsiaAI | Distinct repos (separate IDs, no redirect) — verified |
| Total rows | 88 repo rows + 2 profile rows = 90; dispositions 59 reject / 22 research / 4 build / 3 already covered |
| Fit distribution | 0:36 · 1:28 · 2:12 · 3:9 · 4:2 · 5:1 |
| Licence distribution | 29 MIT / 16 Apache-2.0 / 7 AGPL / 29 none / 1 GPL / 2 non-commercial / 1 fair-code / 1 MPL-2.0 (= 86 resolved) |
| Code, product files, external accounts touched | None |

---

*Docs-only research artifact. Prepared 2026-11-10 on branch `feat/adtech-triage-2026-11-10`. No merge.*