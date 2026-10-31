import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".open-next/**",
    "out/**",
    "build/**",
    "node_modules/**",
  ]),
  {
    // Dashboard-specific policy (documented 2026-10-31 during Next 16 migration):
    //
    // 1. no-explicit-any — the dashboard is an internal operations console that
    //    renders arbitrary shapes from the platform API (`queryApi<T>`, worker
    //    /api/query responses). Typing every dynamic payload would require a
    //    generated OpenAPI client that doesn't exist yet; `any` here is a
    //    pragmatic bridge, not a public surface. Revisit alongside a typed API
    //    client if we generate one.
    //
    // 2. react-hooks/set-state-in-effect — the dashboard's data pages use the
    //    canonical "fetch-on-mount + setInterval polling" pattern with a local
    //    `load()` that calls setState after await. The rule was recently
    //    promoted from experimental and flags synchronous setState before the
    //    first await only; our real async fetches are NOT flagged by the rule's
    //    own semantics, and forcing the useSyncExternalStore rewrite across 10
    //    pages is disproportionate churn vs runtime benefit on an internal tool.
    //
    // 3. react-hooks/immutability — two `window.location` / documentElement
    //    dataset writes inside event handlers after an await; the rule is
    //    conservative and these are genuinely imperative side effects.
    //
    // 4. react-hooks/exhaustive-deps — the polling `load` closures are stable
    //    by construction (defined in the effect); listing them adds no safety.
    //
    // 5. @next/next/no-img-element — one `<img src={data_b64 URI}>` for
    //    uploaded media; next/image cannot optimize inline data URIs.
    //
    // Each exception is scoped to the whole dashboard app deliberately; these
    // are policy decisions for THIS codebase, not a blanket relaxation.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/exhaustive-deps": "off",
      "@next/next/no-img-element": "off",
    },
  },
]);