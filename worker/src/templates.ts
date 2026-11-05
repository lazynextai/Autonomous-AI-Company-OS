/**
 * Starter company template packs — DATA artifacts, not runtime agents.
 *
 * The packs live in `templates/*.json` at the repo root and are bundled into
 * the worker at deploy time: wrangler/esbuild inlines these static JSON
 * imports, because Workers have no runtime filesystem ("read templates/ at
 * startup" means the bundle carries the parsed objects). Serving them from KV
 * instead would add a deploy-time sync step for data that never changes per
 * request; the bundle is the natural binding, exactly like `worker/src/manifests.ts`
 * gets its company_manifests data from D1 rather than from local files.
 *
 * Nothing here activates anything. A pack is fed into the EXISTING manifest
 * routes by an operator — POST /manifests/validate then POST /manifests/activate
 * — and the shipped validator (validateManifest in manifests.ts) is the only
 * gate. Packs never grant `admin` connector permission, and a role id must map
 * to a real agent the fleet runs (pinned by worker/test/templates.test.mjs).
 */
import leanStartup from "../../templates/lean-startup.json";
import agencyAccessibility from "../../templates/agency-accessibility.json";
import { json } from "./gateway";

/** The bundled catalogue. Order is the order the picker should show. */
export const TEMPLATE_PACKS: Record<string, unknown>[] = [leanStartup, agencyAccessibility];

export const listTemplatePacks = (url: URL): Response => {
  const includeBody = url.searchParams.get("include_body") === "1";
  const packs = TEMPLATE_PACKS.map((p) => {
    const entry: Record<string, unknown> = {
      name: p.name,
      description: p.description ?? "",
      version: p.version ?? 1,
    };
    // body is opt-in, mirroring GET /manifests?include_body=1 — it lets an
    // operator pipe a pack straight into POST /manifests/validate.
    if (includeBody) entry.body = p;
    return entry;
  });
  return json({ packs });
};
