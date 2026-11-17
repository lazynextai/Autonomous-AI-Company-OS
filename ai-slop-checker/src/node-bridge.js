"use strict";
/**
 * Lazynext AI Slop Checker — Node runtime bridge.
 *
 * The engine ships as a plain CommonJS module tree that also bundles as a
 * Cloudflare Worker (Service Worker format, api/worker.js). Workerd has no
 * node:* builtins in that format, and wrangler's bundler REFUSES a build
 * that statically imports node:fs / node:path / node:url without the
 * nodejs_compat flag. This module gives Node-only filesystem access to the
 * modules that need it (src/project-scanner.js, src/rules-loader.js) with:
 *
 *   1. a lazy computed specifier — `require("node:" + "fs")` — that esbuild
 *      cannot statically analyze, so it never becomes an external node:
 *      import in the Worker bundle; and
 *   2. a runtime guard (real Node detected via process.versions.node) that
 *      is false on the edge, so the require is never executed there.
 *
 * Under Node the returned modules are the real node:fs / node:path and all
 * file-loading behavior is unchanged; on Workers they are null and the
 * calling code's existing null guards (or the worker's 400/501
 * short-circuits) apply. Zero dependencies, no state.
 */

function isNode() {
  return (
    typeof process !== "undefined" &&
    !!process.versions &&
    typeof process.versions.node === "string" &&
    process.versions.node.length > 0
  );
}

function nodeRequire(name) {
  // Computed specifier on purpose: see the header comment.
  return require("node:" + name);
}

function nodeFs() {
  return isNode() ? nodeRequire("fs") : null;
}

function nodePath() {
  return isNode() ? nodeRequire("path") : null;
}

module.exports = { isNode, nodeFs, nodePath };