"use strict";
/**
 * Lazynext AI Slop Checker — service worker registration (web/register-sw.js).
 *
 * Registers web/sw.js ONLY when the page is served over http(s). A service
 * worker registration on file:// fails loudly in every browser, so the
 * guard keeps the no-server double-click workflow (open web/index.html
 * directly from disk) working without console noise. Also skips registration
 * when service workers are unsupported. Purely additive to the page: this
 * script adds nothing to the DOM.
 */
(function () {
  if (!("serviceWorker" in navigator)) return; // unsupported: nothing to do
  if (!/^https?:$/.test(window.location.protocol)) return; // file:// etc.
  if (!navigator.serviceWorker.controller && !window.isSecureContext) return; // paranoid: SW needs a secure context

  window.addEventListener("load", function () {
    // Path-relative so the checker works from any mount path.
    var swUrl = "./sw.js";
    navigator.serviceWorker.register(swUrl, { scope: "./" }).catch(function (err) {
      // Never break the page over a SW failure; log once.
      if (window.console && window.console.warn) {
        window.console.warn("Lazynext Slop Checker: service worker registration failed", err);
      }
    });
  });
})();