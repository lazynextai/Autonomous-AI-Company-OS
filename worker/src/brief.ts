/**
 * Campaign creative brief — the thinking behind a campaign, as data.
 *
 * A campaign row used to be `subject/html/segment`; the angle, hook, audience,
 * proof points and compliance notes behind the copy existed nowhere. They now
 * travel with the campaign, and — because a brief is advisory metadata, never a
 * gate — a campaign without one behaves exactly as before.
 *
 * The hash is the point of the hash: a decision package approves a *target*
 * (`campaign:<id>`), and the send records the brief it actually sent under, so
 * an approval can be tied to the exact brief that was approved. The canonical
 * form is fixed field order, trimmed values, present fields only — the same
 * brief always hashes the same, and a whitespace edit cannot silently reuse an
 * approval for different copy thinking.
 *
 * Deterministic, no LLM, no imports. Compliance notes are stamped as written by
 * a human/agent — nothing here *generates* a claim, and the copy gate
 * (`copygate.ts`) is the verifier that blocks an unsupported conformance claim.
 */

export const BRIEF_FIELDS = ["angle", "hook", "audience", "proof", "compliance_note"] as const;
export type BriefField = (typeof BRIEF_FIELDS)[number];
export type CampaignBrief = Partial<Record<BriefField, string>>;

/** Each field is capped at 400 characters — a brief, not an essay. */
export const BRIEF_MAX_CHARS = 400;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validate an incoming `brief`. Absent (or an empty object) is valid and means
 * "no brief". Anything malformed is a 400, never a silent downgrade: a brief
 * that was dropped without telling the operator is worse than a rejected one.
 */
export function normalizeBrief(input: unknown): {
  ok: boolean;
  brief: CampaignBrief | null;
  errors: string[];
} {
  if (input == null) return { ok: true, brief: null, errors: [] };
  if (!isPlainObject(input)) {
    return { ok: false, brief: null, errors: ["brief must be an object"] };
  }

  const known = new Set<string>(BRIEF_FIELDS);
  const unknown = Object.keys(input).filter((k) => !known.has(k));
  if (unknown.length) {
    return {
      ok: false,
      brief: null,
      errors: [`unknown brief field(s): ${unknown.join(", ")} — allowed: ${BRIEF_FIELDS.join(", ")}`],
    };
  }

  const errors: string[] = [];
  const brief: CampaignBrief = {};
  for (const field of BRIEF_FIELDS) {
    const raw = input[field];
    if (raw == null) continue;
    if (typeof raw !== "string") {
      errors.push(`brief.${field} must be a string`);
      continue;
    }
    const value = raw.trim();
    if (!value) continue;
    if (value.length > BRIEF_MAX_CHARS) {
      errors.push(`brief.${field} exceeds ${BRIEF_MAX_CHARS} characters`);
      continue;
    }
    brief[field] = value;
  }
  if (errors.length) return { ok: false, brief: null, errors };
  return { ok: true, brief: Object.keys(brief).length ? brief : null, errors: [] };
}

/** Fixed field order, present fields only — the canonical hash input. */
export function canonicalBrief(brief: CampaignBrief): string {
  const ordered: Record<string, string> = {};
  for (const field of BRIEF_FIELDS) {
    const value = brief[field];
    if (typeof value === "string" && value) ordered[field] = value;
  }
  return JSON.stringify(ordered);
}

/** SHA-256 of the canonical JSON, lowercase hex. */
export async function hashBrief(brief: CampaignBrief): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalBrief(brief));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Re-validate a stored value before using it. A row written before this
 * feature, a truncated value, or a hand-edited column all degrade to "no
 * brief" rather than throwing on the send path.
 */
export function parseStoredBrief(raw: unknown): CampaignBrief | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return normalizeBrief(raw).brief;
  try {
    return normalizeBrief(JSON.parse(String(raw))).brief;
  } catch {
    return null;
  }
}
