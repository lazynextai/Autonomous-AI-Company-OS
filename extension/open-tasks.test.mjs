// Badge open-task filter must match task_log status vocabulary
// (pending / in_progress), not the unused queued / running labels.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, "background.js"), "utf8");

// Lift the shipped helper so the filter cannot drift from this test.
const match = src.match(/function countOpenTasks\(tasks\) \{[\s\S]*?\n\}/);
assert.ok(match, "background.js must define countOpenTasks");
const countOpenTasks = new Function(`${match[0]}; return countOpenTasks;`)();

test("open badge counts pending and in_progress only", () => {
  assert.equal(
    countOpenTasks([
      { status: "pending" },
      { status: "in_progress" },
      { status: "completed" },
      { status: "failed" },
      { status: "escalated" },
      { status: "queued" },
      { status: "running" },
    ]),
    2,
  );
});

test("empty or missing task lists yield zero", () => {
  assert.equal(countOpenTasks(undefined), 0);
  assert.equal(countOpenTasks(null), 0);
  assert.equal(countOpenTasks([]), 0);
});

test("background.js does not filter on queued/running", () => {
  assert.match(src, /status === "pending"/);
  assert.match(src, /status === "in_progress"/);
  assert.equal(/status === "queued"/.test(src), false);
  assert.equal(/status === "running"/.test(src), false);
});
