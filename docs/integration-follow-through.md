# Integration follow-through

Evidence reviewed on 2026-10-09 and updated on 2026-10-11. This covers the supplied Devin backlog;
historical restrictions remain unverified unless current evidence appears below.
Account username preference for all existing and future accounts, in order:
`lazynext`, `lazynextai`, `lazynext.ai`, `lazynext-ai`, `lazynext_ai`.
Choose the first available format supported by the provider; do not invent
another fallback. Account email: `support@lazynext.com`. Check rename restrictions
and update affected links/integrations when correcting existing handles.
Snapchat is now `lazynext`; the founder completed the phone-app rename and the
refreshed authenticated desktop account verifies it.

## Username correction review (2026-10-10)

- Instagram: changed `lazynext.ai` to first-choice `lazynext`. Reopened the
  username settings and verified the saved value. Accounts Centre lists lazynext.
- Threads: independently changed `lazynext.ai` to first-choice `lazynext`.
  Accounts Centre and reopened username settings both verify the saved value.
- Snapchat: founder completed the phone-app change to first-choice `lazynext`.
  Refreshed authenticated desktop Accounts confirms display name Lazynext and
  username lazynext. No further rename needed. Official support limits changes
  to once per year.
  Source: https://help.snapchat.com/hc/en-us/articles/7012349845140-How-do-I-change-my-Snapchat-username
- No old Instagram/Threads profile URLs were found in repository content in a
  targeted search. Ayrshare may retain cached labels; rename does not itself
  prove publishing access. No verification post was sent.
- This is a partial account audit, not a claim that every account now follows
  the naming rule. Connected-network display names are not always usernames.
- Ayrshare refreshed dashboard: Reddit label `lazynext`, Bluesky
  `lazynext.bsky.social` (provider domain suffix), Snapchat cached `lazynextvideo`
  despite the source account's verified rename to `lazynext`.
  Instagram label still caches `lazynext.ai` despite the verified source rename;
  all ten previously linked networks remain marked Linked. Do not disconnect
  working accounts merely to refresh labels. Other labels are display names,
  so their actual handles need source-account review.
- Postiz account inventory could not be refreshed: two read-only integrations
  requests returned HTTP 502. No account changes or container restarts performed.

## Fresh evidence

### Continued username review (2026-10-11)

- GitLab changed from `lazynextai` to first-choice `lazynext`; account settings
  confirmed "Username successfully changed" and the new current path. Existing
  owned project is in the separate `lazynext1/platform` group, not the renamed
  personal namespace. Local GITLAB_HANDLE updated after API confirmation.
- YouTube authenticated channel `UCf76xZStSHc1EJHv0VfalaQ` shows `@lazynext`.
- Pinterest authenticated profile settings link to `pinterest.com/lazynext`;
  no username change needed. API Standard access remains a separate review.
- Skool existing account email sign-in succeeded after saved password rejection.
  Profile URL remains `skool.com/@lazynext-ai-7304`: the field is disabled and
  requires 90 contributions, 30 followers, and 90 days of use before changing.
  Do not fabricate engagement or buy activity to bypass this restriction.
- Postiz inventory recovered (HTTP 200): 24 enabled connections. Records show
  `lazynext` for WordPress, Mastodon, Hashnode, Dribbble, Tumblr, DEV.to, Whop,
  Lemmy and Pinterest; Bluesky `lazynext.bsky.social`; YouTube `@lazynext`.
  These are connection records, not fresh source-account verification.
- Other recorded handles still need first-choice availability review: Kick,
  Twitch and Moltbook use `lazynextai`; Telegram uses `lazynext_ai`;
  Slack's integration profile is `lazynext_social` (verify whether this is a
  bot/integration label rather than the company account username).
- Instagram/Threads connection records cache the previous handles; source
  account rename evidence above is authoritative. No additional post sent.
- X: authenticated username settings tested first-choice `lazynext`; provider
  returned "That username has been taken. Please choose another." Existing
  second-choice `Lazynextai` retained (case-insensitive handle). Restored the
  original form value with Save disabled; no X account change or payment made.
- Kick: existing password rejected with both support email and recorded
  `lazynextai` username. No password reset started. Founder sign-in requested.
- Twitch: existing-account login returned "Your browser is not currently
  supported." Founder direct sign-in requested; no security bypass attempted.
- Moltbook fresh authenticated /agents/me returned HTTP 200: `lazynextai`,
  claimed. Public /agents/profile?name=lazynext returned HTTP 200 and an existing
  profile named `lazynext`, so the current second-choice name is appropriate.
  Official https://www.moltbook.com/skill.md documents profile updates for
  description/metadata only; no rename attempted or duplicate agent created.
- Telegram fresh bot getMe returned HTTP 200: `LazynextBot`, is_bot true.
  getChat verifies the company channel `lazynext_ai`. Queries for `lazynext` and
  `lazynextai` returned chat-not-found, which does NOT prove availability (user
  accounts/reserved names may not resolve through bot getChat). Official FAQ
  allows letters, numbers and underscores, so the dot/hyphen alternatives are
  unsupported: https://telegram.org/faq#q-what-can-i-use-as-my-username
  Telegram Web is at the phone QR-login screen; owner authentication is needed
  for a definitive availability check and any channel rename. No message sent.
- GitHub authenticated account is `lazynextai`. Public lookup of `lazynext`
  returned 404, but the actual authenticated rename form explicitly says
  "Username 'lazynext' is unavailable." Cancelled the form and retained the
  valid second choice; no repository paths changed. A public 404 is not proof
  that a username is available.
- Fresh read-only health checks passed: all six HTTP services and five KV
  liveness timestamps. No transition alerts or outbound messages sent.

| Item | Current evidence | Remaining action |
| --- | --- | --- |
| GitLab | Account renamed to lazynext; existing PAT authenticates (200); public snippet 6066554 still readable and author now lazynext | Verification complete for text snippets |
| Listmonk | Settings API 200; enabled Brevo SMTP on 587 with STARTTLS; fresh SMTP authentication 235; prior delivery recorded in CHANNELS.md | Fresh delivery requires a separately authorized email |
| Native catalog | Fresh catalog confirms 39/45 credentials present and line true | Six missing: linkedin, tiktok, snapchat, teams, viber, beehiiv; publication capability must be checked separately |
| Postiz | API recovered after backend startup; 24 enabled integrations | Enabled status alone does not prove publishing |
| Ayrshare | Ten linked accounts: bluesky, facebook, gmb, instagram, pinterest, reddit, snapchat, threads, twitter, youtube; Snapchat confirmed by UI and /api/user HTTP 200 | LinkedIn, Telegram, TikTok remain unlinked; publishing needs separate evidence |
| DEV.to | Current authenticated users/me returns 401; recent appeal correspondence reviewed | Inspect account/appeal state; do not reuse invalid credentials |
| VK | Current users.get returns API error 5 | Reauthorize through supported account flow |
| Pinterest | Latest unread mail acknowledges Standard-access resubmission | Inspect developer portal decision and app demo requirements |
| Pastebin | Current welcome mail confirms lazynext account | Inspect profile/access; old signup-block claim is stale |
| Linktree | Current welcome mail confirms account creation | Inspect profile completion; old signup-block claim is stale |
| beehiiv | Email received 2026-10-10 09:54 UTC says identity verification unsuccessful; exact cause not specified | Personal-ID retry declined by founder; investigate supported company-document alternative; API connection remains pending |
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

Context7 and Firecrawl now expose callable tools. No callable Penpot capability
was found. Browser automation remains available through the connected Chrome
session, including supported Playwright controls.

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
possible reasons, without naming the actual cause. Founder has declined any
further personal identity verification for company accounts. Do not reopen the
retry or request personal ID/selfies. Investigate company-only verification if
explicitly supported; do not upload company documents into a personal-ID flow.
Mail was read without label changes or deletion. No ID or selfie belongs in
project files or chat.

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
| Ayrshare missing links | LinkedIn, Telegram, TikTok; Snapchat is now linked |
| Provider reviews | Reddit case 18570750; MeWe developer app; Lemmy dbzer0; SaaSHub; VS Marketplace domain; Partner Center case 2610070060003196; Glama; DEV.to; NuGet key expiry/rotation |
| Account interaction | Farcaster signer; VK phone verification; Google Business verification; LinkedIn company-only alternative; TikTok, Viber signup; Telegram admin; Poe SMS; Blogger reauthentication; Hetzner address; Alibaba phone; Gumroad payout. Snapchat signup/profile/linking completed |
| Business decisions | X funding, Meta funding, Hashnode Pro, mcp.so, Azure subscription, Teams organization; research current Microsoft startup benefits before promising a tenant |
| Previously reported network failures | CodePen, Slashdot, OpenHub, Postman, StackShare, Mixcloud, Imgur, DeviantArt, Newgrounds, Dreamwidth, OpenVC, Gab, telegra.ph; npm SDK publication is verified complete; Linktree and Pastebin now have creation evidence |
| Claimed unavailable paths | Medium Postiz, Snapchat organic API, Instagram standalone, Nostr REST, Quora/Hacker News/Product Hunt write APIs, WeChat, Weibo, Xiaohongshu, Lemon8; verify current official capabilities before declaring permanent impossibility |
| Repository/account cleanup | Historical AGENTS ledger changes, DEV.to profile visibility, Instagram display name, Dribbble credential rotation; current git status has no pending AGENTS.md change |

## Company-only verification research (2026-10-10)

Firecrawl is now installed and was used to fetch beehiiv's official help pages
live. Its identity guide (updated October 9, 2026) still requires an individual
identity document for API access. Neither that guide nor its Stripe account-type
guide documents a company-certificate replacement or exemption. This is a limit
of the published guidance, not proof that support cannot offer an alternative.
Keep beehiiv API integration pending under the founder's company-only preference.
No new verification submission, support message, or payment was made.

Sources:
- https://www.beehiiv.com/support/article/12889886149655-how-to-confirm-your-account-with-stripe-identity-verification
- https://www.beehiiv.com/support/article/30064926230679-using-stripe-with-beehiiv-account-types-explained

## Latest continuation (2026-10-10)

- Fresh health checker run returned OK.
- LINE bot/info again returned 200 for lazynext @118xfmuh. No additional
  broadcast was sent.
- Fresh VK users.get still returned API error 5 (invalid authorization).
  The previously prohibited challenge route was not revisited or bypassed.
- Fresh native connector catalog again returned 39/45 credentials, with the
  same six missing credentials listed above.
- Linktree admin navigation failed with ERR_SSL_PROTOCOL_ERROR. Account creation
  remains supported by its welcome email; profile completion remains unverified.
- beehiiv publication name was saved as Lazynext and its description as
  "Updates from Lazynext — the Autonomous AI Company Operating System.";
  general settings independently showed both saved values. Timezone was saved
  as Kolkata. No personal verification was started. Its checklist remains 1/6;
  name/description updates alone do not complete the branding checklist.
- DEV support's October 7 response explicitly imposed a one-week suspension
  for content-policy violations. It says a reinstatement request can be made
  after that week, with an acknowledgement of its Terms and Code of Conduct.
  The suspension period has not elapsed on October 10. No appeal was sent and
  no attempt to publish around the suspension was made.
- Latest matching mail still shows Pinterest Standard-access resubmission
  acknowledgement, with no subsequent approval in the searched results.

## Guardrails and evidence limits

Snapchat signup continuation (2026-10-10): the founder completed signup/sign-in.
The authenticated Accounts screen confirms display name Lazynext and username
lazynextvideo at signup. Subsequent founder phone-app rename to lazynext was
independently verified; see the ordered naming review above.
Ayrshare Google sign-in succeeded
for support@lazynext.com. Its Snapchat link reaches the actual OAuth consent
screen, requesting Ads Manager Organisation and Public Profile APIs. The
founder explicitly approved this access. Snapchat then displayed Authorisation
successful. Ayrshare's callback rejected linking because a Public Profile is
required; its Snapchat tile still says Click to link. No Snapchat post or
advertising spend has occurred. Desktop Business Manager loads the existing
Lazynext organisation and offers Public Profiles in its product menu; the
Profile Manager existing-account flow succeeded through the company Google
login. It now shows Complete your Public Profile for lazynextvideo and the
Create Public Profile button. The founder explicitly approved its Commercial
Content Terms, and creation succeeded for profile
dfa7da04-3362-4845-9e05-a01b68174d0e. The Ayrshare authorization was completed
with the already-approved permissions: its UI shows Snapchat successfully
linked as lazynextvideo; /api/user returned HTTP 200 with snapchat among ten
activeSocialAccounts. Public Profile details saved and visibly verified: display
name Lazynext, company bio, Business category, India, support@lazynext.com,
https://lazynext.com. No new password was captured, no photo was uploaded, and
no post or advertising spend occurred. Linking does not prove publication.
No phone-only limitation is inferred from Ayrshare's generic error text.

Continuation checks: Snapchat's current web sign-in reaches a password screen
for the company email; no saved Snapchat password is available locally. This
does not establish whether an account exists. The page is ready for founder
sign-in. Instagram login with its current saved credential reaches reCAPTCHA;
the security check cleared and the authenticated Edit Profile screen confirms
display name Lazynext and the existing company bio. Display-name normalization
is therefore complete. No profile rewrite was needed. Snapchat has no existing
account according to the founder; its signup form is prepared with Lazynext and
username lazynext. Required birthday, new-password entry, terms acceptance and
any subsequent verification remain with the account owner. No password reset,
new account submission, or challenge workaround was attempted.

Context7's beehiiv SDK documentation describes API-key-authenticated publication
operations; the publication ID is an identifier, not a replacement credential.
Targeted mailbox searches since October 7 found no new decisions from Reddit,
MeWe, dbzer0, Glama, or NuGet. Absence of matching mail is not a portal decision.

Fresh repository validation: 85 Python tests passed, five skipped; all 48 worker
tests passed; all 398 product tests passed. Total: 531 passed, five skipped.

Do not claim all integrations complete from credential counts. Publishing,
email delivery, identity verification, paid subscriptions, account changes,
and provider decisions require their own evidence and appropriate authorization.
The single GitLab snippet and one LINE test broadcast were explicitly
authorized and dispatched. No other social post or email was sent. Preserve Dodo test mode,
two-factor enrollment, the 30-day trial offer, private archives, and all mail.
