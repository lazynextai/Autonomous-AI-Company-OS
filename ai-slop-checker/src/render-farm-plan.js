"use strict";
/**
 * Expectations for the local render farm (scripts/render-farm.js).
 *
 * The farm serves fixtures/render-farm/*.html to the optional Playwright
 * collector and runs scanRender on the snapshot. This module is the
 * assertion table, with no browser of its own, so the unit tests can lock
 * the contract even when Playwright is not installed.
 */

const FIXTURES = [
  {
    id: "slop",
    file: "slop.html",
    mustInclude: ["r-marquee", "r-glued-arrow"],
    mustExclude: [],
  },
  {
    id: "clean",
    file: "clean.html",
    mustInclude: [],
    mustExclude: ["r-marquee", "r-glued-arrow", "r-gradient-text", "r-fake-progress"],
  },
];

function evaluateFixture(report, fixture) {
  const ids = [...new Set((report && report.matches ? report.matches : []).map((m) => m.id))].sort();
  const present = new Set(ids);
  const missing = (fixture.mustInclude || []).filter((id) => !present.has(id));
  const unexpected = (fixture.mustExclude || []).filter((id) => present.has(id));
  return {
    id: fixture.id,
    ok: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected,
    ids,
  };
}

module.exports = { FIXTURES, evaluateFixture };
