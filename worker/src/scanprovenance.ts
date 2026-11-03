// Scan provenance — is a scan an OUTSIDE visitor, or is it us?
//
// `report:*` (the funnel's scan source) and `scan_stats` (the benchmark
// corpus) both store only the scanned URL, never the caller, so the only
// available provenance signal is the host. The evidence in
// `docs/research/scan-traffic-provenance-2026-11-03.md` shows the raw volume
// metric overstated outside traffic by 18.9x (132 "scans" of which 125 were
// our dogfood monitor, the CI canary, pasted-HTML payloads, and fixtures).
//
// This module is the platform-side copy of the product worker's `benchHost()`
// gate — canonical source: `products/accessibility-checker/src/scan_pipeline.js`
// (`benchHost`, ~line 22). It is a copy rather than an import because the
// product worker bundles its own repo and cannot import platform modules.
// `worker/test/scan-provenance.test.mjs` pins both against one fixture table
// so the two cannot drift silently. Change the rule in BOTH places.

// Strict DNS hostname: at least one dot, ASCII letters/digits/hyphen only,
// every label 1-63 chars starting and ending alphanumeric. This is the gate
// that keeps the proven malformed corpus rows out — URL parsing accepts `)`
// and `,` in a hostname (they are not WHATWG-forbidden host code points), so
// pasted URL lists leaked entries like `x.workers.dev)` and
// `wellknown.network),` straight into the benchmark. A hostname that fails
// this is not a site anyone can measure.
const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Returns the comparable hostname for `url`, or `null` when the scan must not
 * be treated as an external site. Mirrors the product's `benchHost()`:
 *
 *  - pasted-HTML scans / non-http(s) values → null (no host at all)
 *  - malformed hostnames (trailing `)`, commas, spaces, underscores, path
 *    fragments) → null
 *  - our own surfaces: `lazynext.com`, `*.lazynext.com`, `*.workers.dev`
 *  - our Pages mirrors: `*.github.io`
 *  - IANA reserved test domains: `example.com/.net/.org` + subdomains
 *  - reserved TLDs: `.test .invalid .local .internal .lan .example`
 *  - `localhost`, bare IPv4, and anything carrying a port or IPv6 (contains `:`)
 */
export function benchHost(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  // Same check the product applies before it calls benchHost — a scan with
  // pasted HTML has no URL and by definition no external host.
  if (!/^https?:\/\//i.test(url)) return null;
  let h: string;
  try {
    h = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
  if (!h || h.length > 253 || h.includes(":") || !HOSTNAME_RE.test(h)) return null;
  if (
    h === "localhost" ||
    h === "lazynext.com" || h.endsWith(".lazynext.com") ||
    h === "workers.dev" || h.endsWith(".workers.dev") ||
    h.endsWith(".github.io") ||
    h === "example.com" || h.endsWith(".example.com") ||
    h === "example.org" || h.endsWith(".example.org") ||
    h === "example.net" || h.endsWith(".example.net") ||
    /\.(test|invalid|local|internal|lan|example)$/.test(h) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h)
  ) return null;
  return h;
}

/** True only for scans of a real, external http(s) site. */
export function isExternalScanUrl(url: unknown): boolean {
  return benchHost(url) !== null;
}

/** Shape of a stored `report:*` record, as far as provenance cares. */
export type ScanReport = { url?: unknown; ts?: number; src?: unknown };

/**
 * Count the report records that came from an external site. Same records,
 * same 30-day window as the raw `scans_30d` count — the difference is purely
 * provenance. Unreadable/blank values count as "not external" (fail closed:
 * an unprovable scan must never inflate outside traffic).
 */
export function countExternalReports(values: (string | null)[]): number {
  let n = 0;
  for (const v of values) {
    if (v == null) continue;
    try {
      const rec = JSON.parse(v) as ScanReport;
      if (isExternalScanUrl(rec?.url)) n++;
    } catch {
      /* malformed record — not provable as external */
    }
  }
  return n;
}

/**
 * Closed vocabulary of scan sources stamped by the product worker
 * (canonical: `products/accessibility-checker/src/scan_src.js`). The list is
 * the parity-tested contract between the two repos — see
 * `worker/test/scan-provenance.test.mjs`. Change it in BOTH places.
 */
export const SCAN_SOURCES = ["web", "ci", "monitor", "mcp", "a2a", "fixture", "unknown"] as const;
export type ScanSource = (typeof SCAN_SOURCES)[number];

/** Vocabulary member from a stored value, or null when absent/unrecognised. */
export function normalizeScanSource(v: unknown): ScanSource | null {
  return typeof v === "string" && (SCAN_SOURCES as readonly string[]).includes(v)
    ? (v as ScanSource)
    : null;
}

/**
 * Per-source distribution of stored reports — the one-command version of the
 * 2026-11-03 host-classification audit (a GROUP BY instead of a manual pass).
 * Records written before the stamp existed carry no `src` and land in
 * `unstamped` (never dropped: the buckets always sum to the record count), and
 * an unrecognised value lands in `other` rather than vanishing. Malformed
 * records count as `unstamped` — an unreadable scan has no provable source.
 */
export function countBySource(values: (string | null)[]): Record<string, number> {
  const out: Record<string, number> = { unstamped: 0, other: 0 };
  for (const s of SCAN_SOURCES) out[s] = 0;
  for (const v of values) {
    if (v == null) { out.unstamped++; continue; }
    let rec: ScanReport;
    try {
      rec = JSON.parse(v) as ScanReport;
    } catch {
      out.unstamped++;
      continue;
    }
    const src = normalizeScanSource(rec?.src);
    if (src) out[src]++;
    else if (rec?.src == null) out.unstamped++;
    else out.other++;
  }
  return out;
}

/**
 * Guard for the only write path into the benchmark corpus: `INSERT INTO
 * scan_stats` arrives as raw SQL through the internal `/query` route (the
 * product worker writes it at scan time). Validating here means the platform
 * enforces its own corpus hygiene even if a product build regresses — a bad
 * `host` is rejected before D1 sees it.
 *
 * Returns `null` when the statement is fine (or is not a scan_stats insert),
 * otherwise a short reason naming the offending value. Deliberately
 * permissive when it cannot locate a bound `host` value: an unrecognised
 * statement shape must not be blocked by a guard.
 */
export function scanStatsHostViolation(sql: string, params?: unknown[]): string | null {
  if (!/^\s*insert\s+into\s+scan_stats\b/i.test(sql)) return null;
  const cols = sql.match(/\(([^)]*)\)\s*values/i)?.[1];
  if (!cols) return null;
  const idx = cols.split(",").map((c) => c.trim().toLowerCase()).indexOf("host");
  if (idx < 0) return null;
  const value = params?.[idx];
  if (typeof value !== "string" || !value.trim()) return "missing host";
  if (benchHost(`https://${value}`) !== value.toLowerCase()) return `non-external host: ${value}`;
  return null;
}
