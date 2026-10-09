# Integration follow-through

Evidence reviewed on 2026-10-09. This covers the supplied Devin backlog;
historical restrictions remain unverified unless current evidence appears below.
Account naming preference: `lazynext`, or `lazynextai` when unavailable;
account email: `support@lazynext.com`. Do not rename existing accounts blindly.

## Fresh evidence

| Item | Current evidence | Remaining action |
| --- | --- | --- |
| GitLab | Existing PAT authenticated as lazynextai; restored conn:gitlab; platform dispatch returned 201; public snippet 6066554 has the exact approved content | Verification complete for text snippets |
| Listmonk | Settings API 200; enabled Brevo SMTP on 587 with STARTTLS; fresh SMTP authentication 235; prior delivery recorded in CHANNELS.md | Fresh delivery requires a separately authorized email |
| Native catalog | 38/45 credentials present | Seven missing: linkedin, tiktok, snapchat, teams, viber, line, beehiiv; publication capability must be checked separately |
| Postiz | API recovered after backend startup; 24 enabled integrations | Enabled status alone does not prove publishing |
| Ayrshare | Nine linked accounts: bluesky, facebook, gmb, instagram, pinterest, reddit, threads, twitter, youtube | Recheck remaining linking options and account restrictions |
| DEV.to | Current authenticated users/me returns 401; recent appeal correspondence reviewed | Inspect account/appeal state; do not reuse invalid credentials |
| VK | Current users.get returns API error 5 | Reauthorize through supported account flow |
| Pinterest | Latest unread mail acknowledges Standard-access resubmission | Inspect developer portal decision and app demo requirements |
| Pastebin | Current welcome mail confirms lazynext account | Inspect profile/access; old signup-block claim is stale |
| Linktree | Current welcome mail confirms account creation | Inspect profile completion; old signup-block claim is stale |
| beehiiv | Signed in successfully as support@lazynext.com; Lazynext's Newsletter exists; current API settings explicitly require Stripe identity verification to create a key | Founder identity verification; API key creation and wiring afterward |
| Gmail | All 36 unread messages returned by current query reviewed | No deletions, label changes, replies, or sends performed |

GitLab verification: https://gitlab.com/-/snippets/6066554

beehiiv API gate inspected directly at
https://app.beehiiv.com/settings/workspace/api. Registration reminder is not
evidence that the account is absent. The current dashboard shows the account
created and onboarding checklist 1/6 complete. LINE has account identifiers in
the local environment but no access-token variable; its missing connector is
still unresolved and historical future-dated completion notes are insufficient.

Postiz enabled providers: wordpress, bluesky, slack, mastodon, hashnode,
nostr, dribbble, tumblr, skool, devto, telegram, discord, whop, kick,
twitch, listmonk, x, moltbook, lemmy, facebook, instagram, threads,
youtube, pinterest. The historical Google Business Profile connection is not
in this current 24-channel response.

## Full carried-forward inventory

These entries still need a current inspection. They are not confirmed blocked.

| Area | Items and required verification |
| --- | --- |
| Native restrictions | X credits; Meta ad serving; Pinterest write scope; Google Business API quota and listing; Hashnode official API; WhatsApp production recipients; YouTube upload |
| Missing Postiz channels | LinkedIn, LinkedIn Page, Reddit, TikTok, TikTok Business, Farcaster/Warpcast, VK, MeWe, Google Business Profile |
| Ayrshare missing links | LinkedIn, Snapchat, Telegram, TikTok; inspect actual dashboard rather than infer from old list |
| Provider reviews | Reddit case 18570750; MeWe developer app; Lemmy dbzer0; SaaSHub; VS Marketplace domain; Partner Center case 2610070060003196; Glama; DEV.to; NuGet key expiry/rotation |
| Account interaction | Farcaster signer; VK phone verification; Google Business verification; LinkedIn appeal/identity; TikTok, Snapchat, Viber signup; Telegram admin; Poe SMS; Blogger reauthentication; Hetzner address; Alibaba phone; Gumroad payout |
| Business decisions | X funding, Meta funding, Hashnode Pro, mcp.so, Azure subscription, Teams organization; research current Microsoft startup benefits before promising a tenant |
| Previously reported network failures | npm scope and SDK publication, CodePen, Slashdot, OpenHub, Postman, StackShare, Mixcloud, Imgur, DeviantArt, Newgrounds, Dreamwidth, OpenVC, Gab, telegra.ph; Linktree and Pastebin now have creation evidence |
| Claimed unavailable paths | Medium Postiz, Snapchat organic API, Instagram standalone, Nostr REST, Quora/Hacker News/Product Hunt write APIs, WeChat, Weibo, Xiaohongshu, Lemon8; verify current official capabilities before declaring permanent impossibility |
| Repository/account cleanup | Historical AGENTS ledger changes, DEV.to profile visibility, Instagram display name, Dribbble credential rotation; current git status has no pending AGENTS.md change |

## Guardrails and evidence limits

Do not claim all integrations complete from credential counts. Publishing,
email delivery, identity verification, paid subscriptions, account changes,
and provider decisions require their own evidence and appropriate authorization.
Only the single GitLab snippet was authorized for public publication in this
review. No other social post or email was sent. Preserve Dodo test mode,
two-factor enrollment, the 30-day trial offer, private archives, and all mail.
