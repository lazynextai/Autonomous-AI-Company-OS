// The shipped campaign-brief helpers, lifted for route-level tests.
// src/brief.ts has no imports (SHA-256 comes from Web Crypto), so lifting it
// needs no injected deps.
import { loadModule } from "./lift.mjs";

export const brief = loadModule("brief.ts", {}, [
  "BRIEF_FIELDS",
  "BRIEF_MAX_CHARS",
  "normalizeBrief",
  "canonicalBrief",
  "hashBrief",
  "parseStoredBrief",
]);
