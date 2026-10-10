# Integration follow-through

Evidence reviewed on 2026-10-09 and updated on 2026-10-10. This covers the supplied Devin backlog;
historical restrictions remain unverified unless current evidence appears below.
Account naming preference: `lazynext`, or `lazynextai` when unavailable;
account email: `support@lazynext.com`. Do not rename existing accounts blindly.

## Fresh evidence

| Item | Current evidence | Remaining action |
| --- | --- | --- |
| GitLab | Existing PAT authenticated as lazynextai; restored conn:gitlab; platform dispatch returned 201; public snippet 6066554 has the exact approved content | Verification complete for text snippets |
| Listmonk | Settings API 200; enabled Brevo SMTP on 587 with STARTTLS; fresh SMTP authentication 235; prior delivery recorded in CHANNELS.md | Fresh delivery requires a separately authorized email |
| Native catalog | Fresh catalog confirms 39/45 credentials present and line true | Six missing: linkedin, tiktok, snapchat, teams, viber, beehiiv; publication capability must be checked separately |
| Postiz | API recovered after backend startup; 24 enabled integrations | Enabled status alone does not prove publishing |
| Ayrshare | Nine linked accounts: bluesky, facebook, gmb, instagram, pinterest, reddit, threads, twitter, youtube | Recheck remaining linking options and account restrictions |
| DEV.to | Current authenticated users/me returns 401; recent appeal correspondence reviewed | Inspect account/appeal state; do not reuse invalid credentials |
| VK | Current users.get returns API error 5 | Reauthorize through supported account flow |
| Pinterest | Latest unread mail acknowledges Standard-access resubmission | Inspect developer portal decision and app demo requirements |
| Pastebin | Current welcome mail confirms lazynext account | Inspect profile/access; old signup-block claim is stale |
| Linktree | Current welcome mail confirms account creation | Inspect profile completion; old signup-block claim is stale |
| beehiiv | Email received 2026-10-10 09:54 UTC says identity verification unsuccessful; current API page offers restart | Founder identity retry; exact rejection cause not specified; key creation and wiring afterward |
| Gmail | All 36 unread messages returned by current query reviewed | No deletions, label changes, replies, or sends performed |
| npm SDK | Registry lists @lazynext/accessibility-checker 1.0.0, published 2026-10-08; maintainer lazynext; registry archive SHA1 verified; all four published files exactly match repository | Publication verified complete; local npm login currently 401 and needed only for future releases |
| LINE | Founder-issued token verified via bot/info HTTP 200 for lazynext @118xfmuh; conn:line saved durably; private local fallback saved; broadcast validation 200; explicitly approved test broadcast through Lazynext OS returned ok true, upstream 200 | End-to-end dispatch accepted; recipient receipt not independently observed |

GitLab verification: https://gitlab.com/-/snippets/6066554

beehiiv API gate inspected directly at
https://app.beehiiv.com/settings/workspace/api. Registration reminder is not
evidence that the account is absent. The current dashboard shows the account
created and onboarding checklist 1/6 complete. LINE is now wired and its test
broadcast accepted; current credentials and identifiers supersede the older notes.

Postiz enabled providers: wordpress, bluesky, slack, mastodon, hashnode,
nostr, dribbble, tumblr, skool, devto, telegram, discord, whop, kick,
twitch, listmonk, x, moltbook, lemmy, facebook, instagram, threads,
youtube, pinterest. The historical Google Business Profile connection is not
in this current 24-channel response.

## Full carried-forward inventory

### 2026-10-10 account inspection

VK dispatch reporting corrected in both worker and local connectors: a VK
HTTP 200 error envelope is now a failed result rather than a successful post.
Worker tests: 48 passed; local VK regressions: 3 passed. Valid credentials
remain required. This change does not restore expired account access.
Deployed worker version: `94384edb-b0ae-4abe-b300-d64d71690e58`.
Deployment used `--containers-rollout=none` because no container image change
was required and the local Docker CLI was unavailable. Existing container
deployment was preserved. No VK test post was sent.

Pinterest developer portal currently redirects to a signed-out login page.
Latest email review acknowledgement remains the last authenticated evidence.

Current Microsoft program guidance does not guarantee a free Teams tenant.
Its FAQ lists Microsoft 365 among investor-offer benefits, subject to eligibility;
the investor offer requires an affiliation referral code. Azure credit activation
requires a card and can transition to paid billing. Do not enroll or activate a
subscription solely to bypass the Teams requirement.
Source: https://learn.microsoft.com/en-us/startups/microsoft-for-startups/mfs-faqs

Context7 and Firecrawl were found as available but uninstalled plugins; suggested
for user installation. No callable Penpot capability was found. Working browser
automation and web research remain available independently.

LINE login and SMS verification completed by founder. After explicit approval
to accept account terms, Official Account creation succeeded: display name
`lazynext`, basic ID `@118xfmuh`, India, Internet and Software. After explicit
API-access and API-terms approval, Messaging API activation succeeded.
Provider `Lazynext` ID `2005622325`; channel ID `2011959429`.
Founder issued the long-lived token. Bot info confirmed the newly created
account before conn:line was stored with ttl 0. Private local CONN_LINE fallback
and current account identifiers were saved in the uncommitted environment file.
No credential values are included in this document. Broadcast validation 200
does not prove delivery. After explicit founder approval, one broadcast with
the exact text `Lazynext OS connection test.` was sent through the platform
connector. Platform HTTP 200, ok true, LINE upstream HTTP 200 with empty JSON
body. This proves dispatch acceptance, not independently observed receipt.

beehiiv identity review is no longer pending. Its rejection email lists generic
possible reasons, without naming the actual cause. The retry prompt was opened
and left at personal consent and identity capture. Mail was read without label
changes or deletion. Founder should use a valid unexpired photo ID and clear
original photos; no ID or selfie should be placed in project files or chat.

Linktree public page inspection failed with ERR_SSL_PROTOCOL_ERROR; no TLS
bypass was attempted. Pastebin public profile reached Cloudflare automatic
verification; welcome mail remains the evidence of account creation, and
neither network result proves that the account is absent.

VK browser navigation redirected to vk.ru/challenge.html. Browser security
policy explicitly prohibited this surface and prohibited workarounds. No
challenge bypass or alternative browser route was attempted. The previously
verified invalid API token remains unresolved; founder sign-in through the
normal VK app is the next available step.

These entries still need a current inspection. They are not confirmed blocked.

| Area | Items and required verification |
| --- | --- |
| Native restrictions | X credits; Meta ad serving; Pinterest write scope; Google Business API quota and listing; Hashnode official API; WhatsApp production recipients; YouTube upload |
| Missing Postiz channels | LinkedIn, LinkedIn Page, Reddit, TikTok, TikTok Business, Farcaster/Warpcast, VK, MeWe, Google Business Profile |
| Ayrshare missing links | LinkedIn, Snapchat, Telegram, TikTok; inspect actual dashboard rather than infer from old list |
| Provider reviews | Reddit case 18570750; MeWe developer app; Lemmy dbzer0; SaaSHub; VS Marketplace domain; Partner Center case 2610070060003196; Glama; DEV.to; NuGet key expiry/rotation |
| Account interaction | Farcaster signer; VK phone verification; Google Business verification; LinkedIn appeal/identity; TikTok, Snapchat, Viber signup; Telegram admin; Poe SMS; Blogger reauthentication; Hetzner address; Alibaba phone; Gumroad payout |
| Business decisions | X funding, Meta funding, Hashnode Pro, mcp.so, Azure subscription, Teams organization; research current Microsoft startup benefits before promising a tenant |
| Previously reported network failures | CodePen, Slashdot, OpenHub, Postman, StackShare, Mixcloud, Imgur, DeviantArt, Newgrounds, Dreamwidth, OpenVC, Gab, telegra.ph; npm SDK publication is verified complete; Linktree and Pastebin now have creation evidence |
| Claimed unavailable paths | Medium Postiz, Snapchat organic API, Instagram standalone, Nostr REST, Quora/Hacker News/Product Hunt write APIs, WeChat, Weibo, Xiaohongshu, Lemon8; verify current official capabilities before declaring permanent impossibility |
| Repository/account cleanup | Historical AGENTS ledger changes, DEV.to profile visibility, Instagram display name, Dribbble credential rotation; current git status has no pending AGENTS.md change |

## Guardrails and evidence limits

Do not claim all integrations complete from credential counts. Publishing,
email delivery, identity verification, paid subscriptions, account changes,
and provider decisions require their own evidence and appropriate authorization.
The single GitLab snippet and one LINE test broadcast were explicitly
authorized and dispatched. No other social post or email was sent. Preserve Dodo test mode,
two-factor enrollment, the 30-day trial offer, private archives, and all mail.
