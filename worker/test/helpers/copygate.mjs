// The shipped copy-quality rule table, lifted once for route-level tests.
// src/copygate.ts has no imports, so lifting it needs no injected deps.
import { loadModule } from "./lift.mjs";

export const copygate = loadModule("copygate.ts", {}, [
  "COPY_RULES",
  "SLOP_PHRASES",
  "lintCopy",
  "blockingFindings",
  "warningFindings",
  "describeCopyFindings",
]);
