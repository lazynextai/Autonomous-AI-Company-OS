// Shared loader for the capability table, for suites that lift services.ts.
//
// WHY: `services.ts` reads `capabilityOf` on every REAL dispatch (the daily cap
// consults `rate_limit.per_day` before any provider call), not only on the
// dry-run branch. A harness that stubs the governance collaborators but not
// this one throws `ReferenceError: capabilityOf is not defined` the moment it
// dispatches. Injecting the SHIPPED table keeps those tests honest: a stub
// returning null would silently turn the cap off and make every suite pass
// against a dispatcher that no longer enforces anything.
import { loadModule } from "./lift.mjs";

const caps = loadModule("capabilities.ts", {}, ["capabilityOf", "CONNECTOR_CAPABILITIES"]);

export const capabilityOf = caps.capabilityOf;
export const CONNECTOR_CAPABILITIES = caps.CONNECTOR_CAPABILITIES;
