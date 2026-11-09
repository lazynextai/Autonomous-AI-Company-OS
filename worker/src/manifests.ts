/**
 * Company template manifests — declarative goals, roles, connector
 * permissions, review thresholds and schedules, validated before activation.
 *
 * Roles/prompts stay DATA (no runtime agent is multiplied per persona). The
 * active manifest pointer is stored in KV (`config:manifest:active`) plus the
 * activated D1 row, so activation never mutates the live `company_brain` row
 * the fleet reads — migrations stay idempotent (SQLite has no ADD COLUMN IF
 * NOT EXISTS) and rollback is "activate the previous version".
 */
import { Env, json } from "./gateway";
import { CONNECTOR_IDS } from "./services";
import { AUTHORITY_CLASSES } from "./decisions";

export const MANIFEST_NAME_RE = /^[a-z][a-z0-9-]{0,39}$/;
export const MANIFEST_MAX_BYTES = 64 * 1024;
export const CONNECTOR_PERMISSIONS = ["none", "read", "dispatch", "admin"] as const;
export const RISK_LEVELS = ["low", "medium", "high"] as const;
const TOP_KEYS = new Set(["name", "description", "version", "goals", "roles", "connector_permissions", "review_thresholds", "schedules", "notes", "icp"]);

export interface ManifestValidation { ok: boolean; errors: string[]; manifest: Record<string, unknown> | null }

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function fieldInRange(part: string, min: number, max: number): boolean {
  for (const item of part.split(",")) {
    const [range, stepRaw] = item.split("/");
    if (stepRaw !== undefined && !/^\d+$/.test(stepRaw)) return false;
    if (range === "*") continue;
    const m = range.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < min || b > max || b < a) return false;
  }
  return true;
}

/** Five-field cron shape, with numeric bounds per field. Declarative only. */
export function cronShapeValid(expr: unknown): boolean {
  if (typeof expr !== "string") return false;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const bounds: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  return parts.every((p, i) => fieldInRange(p, bounds[i][0], bounds[i][1]));
}

const slug = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9_]{1,31}$/.test(v);

export function validateManifest(body: unknown): ManifestValidation {
  const errors: string[] = [];
  if (!isObj(body)) return { ok: false, errors: ["manifest must be a JSON object"], manifest: null };
  if (JSON.stringify(body).length > MANIFEST_MAX_BYTES) return { ok: false, errors: ["manifest exceeds 64KB"], manifest: null };

  for (const key of Object.keys(body)) {
    if (!TOP_KEYS.has(key)) errors.push(`unknown top-level key '${key}'`);
  }
  const name = body.name === undefined ? "company" : body.name;
  if (typeof name !== "string" || !MANIFEST_NAME_RE.test(name)) errors.push("name must match ^[a-z][a-z0-9-]{0,39}$");
  if (body.version !== undefined && (!Number.isInteger(body.version) || Number(body.version) < 1)) {
    errors.push("version must be a positive integer");
  }
  // Optional human description of the company shape. Template packs carry one
  // so the GET /templates catalogue can list a pack without parsing freeform
  // `notes`. Declarative only — nothing in the runtime reads it.
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.trim().length < 3 || body.description.length > 200)) {
    errors.push("description must be a 3-200 char string");
  }

  const goals = body.goals;
  if (!Array.isArray(goals) || goals.length < 1 || goals.length > 20) {
    errors.push("goals must be an array of 1-20 strings");
  } else {
    goals.forEach((g, i) => {
      if (typeof g !== "string" || g.trim().length < 3 || g.length > 200) errors.push(`goals[${i}] must be a 3-200 char string`);
    });
  }

  if (body.roles !== undefined) {
    if (!Array.isArray(body.roles) || body.roles.length > 20) errors.push("roles must be an array of at most 20 entries");
    else {
      const seen = new Set<string>();
      body.roles.forEach((r, i) => {
        if (!isObj(r)) { errors.push(`roles[${i}] must be an object`); return; }
        for (const key of Object.keys(r)) {
          if (!["id", "title", "mission", "autonomy"].includes(key)) errors.push(`roles[${i}].${key} is not allowed`);
        }
        if (!slug(r.id)) errors.push(`roles[${i}].id must be a lowercase slug`);
        else if (seen.has(r.id as string)) errors.push(`roles[${i}].id '${r.id}' is duplicated`);
        else seen.add(r.id as string);
        if (typeof r.title !== "string" || !r.title.trim() || r.title.length > 80) errors.push(`roles[${i}].title must be 1-80 chars`);
        if (typeof r.mission !== "string" || !r.mission.trim() || r.mission.length > 400) errors.push(`roles[${i}].mission must be 1-400 chars`);
        if (!AUTHORITY_CLASSES.includes(String(r.autonomy ?? "auto") as (typeof AUTHORITY_CLASSES)[number])) {
          errors.push(`roles[${i}].autonomy must be auto|approval|human_only`);
        }
      });
    }
  }

  if (body.connector_permissions !== undefined) {
    if (!isObj(body.connector_permissions)) errors.push("connector_permissions must be an object");
    else {
      for (const [id, perm] of Object.entries(body.connector_permissions)) {
        if (!CONNECTOR_IDS.includes(id.toLowerCase())) errors.push(`connector_permissions.'${id}' is not a known connector`);
        if (!CONNECTOR_PERMISSIONS.includes(String(perm) as (typeof CONNECTOR_PERMISSIONS)[number])) {
          errors.push(`connector_permissions.'${id}' must be none|read|dispatch|admin`);
        }
      }
    }
  }

  if (body.review_thresholds !== undefined) {
    const t = body.review_thresholds;
    if (!isObj(t)) errors.push("review_thresholds must be an object");
    else {
      for (const key of Object.keys(t)) {
        if (!["cost_cents", "min_evidence", "risk"].includes(key)) errors.push(`review_thresholds.${key} is not allowed`);
      }
      if (t.cost_cents !== undefined && (!Number.isInteger(t.cost_cents) || (t.cost_cents as number) < 0 || (t.cost_cents as number) > 1_000_000_000)) {
        errors.push("review_thresholds.cost_cents must be an integer 0..1e9");
      }
      if (t.min_evidence !== undefined && (!Number.isInteger(t.min_evidence) || (t.min_evidence as number) < 0 || (t.min_evidence as number) > 25)) {
        errors.push("review_thresholds.min_evidence must be an integer 0..25");
      }
      if (t.risk !== undefined && !RISK_LEVELS.includes(String(t.risk) as (typeof RISK_LEVELS)[number])) {
        errors.push("review_thresholds.risk must be low|medium|high");
      }
    }
  }

  if (body.schedules !== undefined) {
    if (!Array.isArray(body.schedules) || body.schedules.length > 10) errors.push("schedules must be an array of at most 10 entries");
    else {
      body.schedules.forEach((s, i) => {
        if (!isObj(s)) { errors.push(`schedules[${i}] must be an object`); return; }
        for (const key of Object.keys(s)) {
          if (!["id", "cron", "enabled"].includes(key)) errors.push(`schedules[${i}].${key} is not allowed`);
        }
        if (!slug(s.id)) errors.push(`schedules[${i}].id must be a lowercase slug`);
        if (!cronShapeValid(s.cron)) errors.push(`schedules[${i}].cron must be a valid five-field cron expression`);
        if (s.enabled !== undefined && typeof s.enabled !== "boolean") errors.push(`schedules[${i}].enabled must be a boolean`);
      });
    }
  }

  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 1000)) {
    errors.push("notes must be a string of at most 1000 chars");
  }

  // Optional ideal-customer-profile. Declarative data only: the fleet's lead
  // scorer reads it to weight qualification signals, nothing in the Worker
  // runtime consumes it. Absent = today's behaviour, unchanged.
  if (body.icp !== undefined) {
    const icp = body.icp;
    if (!isObj(icp)) errors.push("icp must be an object");
    else {
      for (const key of Object.keys(icp)) {
        if (!["firmographics", "signals"].includes(key)) errors.push(`icp.${key} is not allowed`);
      }
      if (icp.firmographics !== undefined) {
        if (!isObj(icp.firmographics)) errors.push("icp.firmographics must be an object");
        else {
          for (const key of Object.keys(icp.firmographics)) {
            if (!["industry", "size", "region"].includes(key)) errors.push(`icp.firmographics.${key} is not allowed`);
          }
          for (const key of ["industry", "size", "region"] as const) {
            const v = icp.firmographics[key];
            if (v === undefined) continue;
            if (!Array.isArray(v) || v.length > 12) { errors.push(`icp.firmographics.${key} must be an array of at most 12 strings`); continue; }
            v.forEach((item, i) => {
              if (typeof item !== "string" || !item.trim() || item.length > 60) {
                errors.push(`icp.firmographics.${key}[${i}] must be a 1-60 char string`);
              }
            });
          }
        }
      }
      if (icp.signals !== undefined) {
        if (!isObj(icp.signals)) errors.push("icp.signals must be an object");
        else {
          for (const key of Object.keys(icp.signals)) {
            if (!["intent", "fit", "timing"].includes(key)) errors.push(`icp.signals.${key} is not allowed`);
          }
          for (const key of ["intent", "fit", "timing"] as const) {
            const v = icp.signals[key];
            if (v === undefined) continue;
            if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
              errors.push(`icp.signals.${key} must be a number between 0 and 1`);
            }
          }
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors, manifest: null };
  return {
    ok: true,
    errors: [],
    manifest: { ...body, name, version: body.version ?? 1 },
  };
}

let manifestSchemaReady = false;

export async function ensureManifestSchema(env: Env): Promise<void> {
  if (manifestSchemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS company_manifests (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL DEFAULT 'company',
       version INTEGER NOT NULL DEFAULT 1,
       body TEXT NOT NULL,
       valid INTEGER NOT NULL DEFAULT 0 CHECK (valid IN (0, 1)),
       activated INTEGER NOT NULL DEFAULT 0 CHECK (activated IN (0, 1)),
       validation_errors TEXT DEFAULT '[]',
       created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
       UNIQUE (name, version)
     )`,
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_company_manifests_active ON company_manifests(name, activated, id)",
  ).run();
  manifestSchemaReady = true;
}

/** Validate + store a new version (invalid attempts are kept for the diff trail). */
export async function validateAndStoreManifest(env: Env, body: unknown): Promise<Response> {
  const result = validateManifest(body);
  await ensureManifestSchema(env);
  const manifest = (result.manifest ?? (isObj(body) ? body : {})) as Record<string, unknown>;
  const name = MANIFEST_NAME_RE.test(String(manifest.name ?? "")) ? String(manifest.name) : "invalid";
  const next = await env.DB.prepare(
    "SELECT COALESCE(MAX(version), 0) + 1 AS v FROM company_manifests WHERE name = ?",
  ).bind(name).first<{ v: number }>();
  const version = result.ok ? Number(manifest.version ?? next?.v ?? 1) : Number(next?.v ?? 1);
  const res = await env.DB.prepare(
    "INSERT OR IGNORE INTO company_manifests (name, version, body, valid, validation_errors) VALUES (?, ?, ?, ?, ?)",
  ).bind(name, version, JSON.stringify(manifest), result.ok ? 1 : 0, JSON.stringify(result.errors)).run();
  return json({
    ok: result.ok,
    name,
    version,
    valid: result.ok,
    errors: result.errors,
    stored: (res.meta.changes ?? 0) > 0,
    activated: false,
    note: result.ok ? "validated; call POST /manifests/activate to make it active" : "invalid manifests are stored for the diff trail but cannot be activated",
  }, result.ok ? 200 : 400);
}

export async function activateManifest(env: Env, body: Record<string, unknown>): Promise<Response> {
  await ensureManifestSchema(env);
  const name = String(body.name ?? "company");
  const version = Number(body.version);
  if (!Number.isInteger(version) || version < 1) return json({ error: "version required" }, 400);
  const row = await env.DB.prepare(
    "SELECT id, name, version, body, valid, validation_errors FROM company_manifests WHERE name = ? AND version = ?",
  ).bind(name, version).first<{ id: number; name: string; version: number; body: string; valid: number; validation_errors: string }>();
  if (!row) return json({ error: `manifest ${name}@${version} not found` }, 404);
  if (row.valid !== 1) {
    return json({ error: "manifest failed validation and cannot be activated", errors: JSON.parse(row.validation_errors || "[]") }, 400);
  }
  const manifest = JSON.parse(row.body) as Record<string, unknown>;
  await env.DB.prepare("UPDATE company_manifests SET activated = 0 WHERE name = ?").bind(name).run();
  await env.DB.prepare("UPDATE company_manifests SET activated = 1 WHERE id = ?").bind(row.id).run();

  // Intent surface only: a KV pointer. Nothing in the runtime reads it yet, so
  // activation cannot change agent behaviour by accident.
  const pointer = {
    name,
    version,
    goals: manifest.goals ?? [],
    review_thresholds: manifest.review_thresholds ?? {},
    roles: Array.isArray(manifest.roles) ? manifest.roles.length : 0,
    activated_at: Date.now(),
  };
  await env.EPHEMERAL.put("config:manifest:active", JSON.stringify(pointer)).catch(() => undefined);
  await env.EPHEMERAL.put("manifests:last_activate", JSON.stringify({ at: Date.now(), name, version })).catch(() => undefined);
  await env.DB.prepare("INSERT INTO episodic_events (scope, payload) VALUES ('manifest', ?)")
    .bind(JSON.stringify({ action: "activated", name, version })).run().catch(() => undefined);
  return json({ ok: true, name, version, intent_surface: "kv:config:manifest:active", pointer });
}

export async function listManifests(env: Env, url: URL): Promise<Response> {
  await ensureManifestSchema(env);
  const name = url.searchParams.get("name");
  const includeBody = url.searchParams.get("include_body") === "1";
  const cols = includeBody
    ? "id, name, version, body, valid, activated, validation_errors, created_at"
    : "id, name, version, valid, activated, validation_errors, created_at";
  const { results } = name
    ? await env.DB.prepare(`SELECT ${cols} FROM company_manifests WHERE name = ? ORDER BY id DESC LIMIT 100`).bind(name).all()
    : await env.DB.prepare(`SELECT ${cols} FROM company_manifests ORDER BY id DESC LIMIT 100`).all();
  return json({ manifests: results ?? [] });
}

export async function latestManifest(env: Env): Promise<Response> {
  await ensureManifestSchema(env);
  const row = await env.DB.prepare(
    "SELECT id, name, version, body, valid, activated, created_at FROM company_manifests WHERE activated = 1 ORDER BY id DESC LIMIT 1",
  ).first();
  if (!row) return json({ active: null }, 200);
  return json({ active: row });
}

export async function handleManifestRoutes(env: Env, path: string, body: Record<string, unknown>): Promise<Response | null> {
  if (path === "/manifests/validate") return validateAndStoreManifest(env, body);
  if (path === "/manifests/activate") return activateManifest(env, body);
  return null;
}
