// marketing.lazynext.com → lazynext.com 301 (2026-11-06).
//
// The marketing site is bound to three hostnames — lazynext.com,
// www.lazynext.com and marketing.lazynext.com — and all three served
// byte-identical copies of every page. Search Console reported
// "Duplicate, Google chose different canonical than user" twice on 2026-10-22,
// i.e. Google overrode our canonical tag and indexed the marketing host,
// leaving almost the whole domain out of the index. A 301 removes the
// duplicate outright instead of asking Google to adjudicate it.
//
// `_redirects` cannot express this: Workers static assets explicitly do not
// support domain-level redirects — see
// developers.cloudflare.com/workers/static-assets/redirects ("Domain-level
// redirects ❌"). This Worker runs first for every request, redirects ONLY the
// marketing host, and passes everything else through to the assets binding so
// `_headers` and `_redirects` keep applying to asset responses unchanged.

const CANONICAL_HOST = "lazynext.com";
const REDIRECT_HOST = "marketing.lazynext.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // A redirect never carries a body, so only GET/HEAD are eligible. A 301 on
    // a POST would silently drop the request — pass those through untouched.
    if (
      url.hostname === REDIRECT_HOST &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      // Preserve the path and query string exactly:
      // /docs?x=1 → https://lazynext.com/docs?x=1
      const target = new URL(`${url.pathname}${url.search}`, `https://${CANONICAL_HOST}`);
      return new Response(null, {
        status: 301,
        headers: { Location: target.toString() },
      });
    }

    // Apex, www, preview hosts and non-GET requests: serve assets exactly as
    // the assets-only worker did before (which applies _headers/_redirects).
    return env.ASSETS.fetch(request);
  },
};
