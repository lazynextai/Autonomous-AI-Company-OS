/**
 * Shared SSRF guard for every URL the platform fetches or renders on a
 * caller's behalf. Extracted from sign.ts's private isSafeDocUrl (PR #126)
 * so /render, /pdf, /scrape, /browse and sign doc_url all classify hosts
 * identically — one guard, one test suite, no drift between doors.
 *
 * Only http(s), and only public-routable hosts. Blocks private (10/8,
 * 172.16/12, 192.168/16), loopback (127/8, ::1), link-local (169.254/16,
 * fe80::/10), CGNAT (100.64/10), multicast, ULA (fc00::/7), and literal
 * hostnames that resolve internally (localhost, *.internal, *.local).
 * Cloud metadata (169.254.169.254) is the highest-value target this kills,
 * including the forms the URL parser rewrites it into: [::ffff:a9fe:a9fe],
 * [::a9fe:a9fe], 6to4 (2002::) and NAT64 (64:ff9b::/96) embeddings.
 *
 * The product repo mirrors this module at
 * products/accessibility-checker/src/urlguard.js — pinned together by
 * parity tests on both sides. Change the rule in BOTH places.
 */

function publicIpv4(octs: number[]): boolean {
  const [a, b] = octs;
  if (octs.some((o) => o > 255)) return false;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

function publicIpv6(addr: string): boolean {
  const dotted = addr.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dotted) {
    const n = dotted[1].split(".").map(Number);
    if (n.some((o) => o > 255)) return false;
    return publicIpv4(n);
  }
  if (addr.includes(".")) return false;
  const sides = addr.split("::");
  if (sides.length > 2) return false;
  const parseSide = (side: string): number[] | null => {
    if (side === "") return [];
    const out: number[] = [];
    for (const group of side.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  const left = parseSide(sides[0]);
  if (!left) return false;
  let h = left;
  if (sides.length === 2) {
    const right = parseSide(sides[1]);
    if (!right || left.length + right.length > 8) return false;
    h = left.concat(new Array(8 - left.length - right.length).fill(0), right);
  }
  if (h.length !== 8) return false;
  const prefixZero = (n: number) => h.slice(0, n).every((part) => part === 0);
  if (h.every((part) => part === 0) || (prefixZero(7) && h[7] === 1)) return false;
  if ((h[0] & 0xffc0) === 0xfe80) return false;
  if ((h[0] & 0xfe00) === 0xfc00) return false;
  if ((h[0] & 0xffc0) === 0xfec0) return false;
  if ((h[0] & 0xff00) === 0xff00) return false;
  const pair = (hi: number, lo: number) => {
    const n = ((hi << 16) | lo) >>> 0;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  };
  if (prefixZero(5) && h[5] === 0xffff) return publicIpv4(pair(h[6], h[7]));
  if (prefixZero(6)) return false;
  if (h[0] === 0x2002) return publicIpv4(pair(h[1], h[2]));
  if (h[0] === 0x0064 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    return publicIpv4(pair(h[6], h[7]));
  }
  return true;
}

/** True only for http(s) URLs whose literal host is public-routable.
 *  DNS names are passed (a Worker cannot resolve them); every IP-literal
 *  vector — dotted, hex, mapped, 6to4, NAT64 — is classified here.
 */
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  // We can't do DNS from a Worker easily, so block by IP literal. The URL
  // parser rewrites [::ffff:169.254.169.254] to [::ffff:a9fe:a9fe] before
  // this runs, so the hex form has to be classified too.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const octs = ipv4.slice(1).map(Number);
    if (!publicIpv4(octs)) return false;
  }
  if (host.startsWith("[") || host.includes(":")) {
    const wrapped = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
    const bare = wrapped.split("%")[0];
    if (!publicIpv6(bare)) return false;
  }
  return true;
}
