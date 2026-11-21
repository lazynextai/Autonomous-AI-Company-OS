"use strict";
/**
 * Lazynext AI Slop Checker — web app logic.
 *
 * Runs the shared engine (data/slop-patterns.js + src/scanner.js +
 * src/rewriter.js, loaded as browser globals) fully in-browser. When this
 * page is served by the Lazynext API (node api/server.js), URL scans are
 * attempted server-side via POST /scan and fall back to a direct fetch.
 *
 * State-model note (UX regression lock, v1.4.1): a scan run is
 * explicit-state — pressing "Scan for slop" FIRST clears the previous
 * results area (never show a stale report), and a failed scan renders a
 * DISTINCT error state in the results area (verdict area shows the error,
 * plus a retry button), never the previous report. The pure state
 * transitions live in the DOM-free `SlopAppState` helpers exposed on
 * window/globalThis so test/app.test.js can exercise them in Node
 * without a browser or DOM library; the DOM glue below consumes them.
 */

(function () {
  const scanner = window.SlopScanner;
  const rewriter = window.SlopRewriter;
  const projectScanner = window.SlopProjectBrowser;
  const judgeEngine = window.SlopJudge; // optional — the Review tab checks it at click time

  // ── Pure, DOM-free state transitions (regression-locked by test/app.test.js) ──
  // The web checker's scan lifecycle is explicit-state: START clears the
  // previous results area; FAILURE renders a distinct error state in the
  // results area (never stale results). These helpers describe exactly that
  // state machine without touching the DOM, so Node can unit-test the
  // behaviour with no browser and no DOM library.
  const SlopAppState = {
    /** The state after a scan START: results hidden, no error. */
    started() {
      return { resultsHidden: true, error: null, staleReport: false };
    },
    /** The state after a scan FINISH: results shown with a fresh report. */
    finished(report) {
      return { resultsHidden: false, error: null, staleReport: false, report: Boolean(report) };
    },
    /** The state after a scan FAILURE: error in the results area, never stale. */
    failed(message) {
      return {
        resultsHidden: false,
        error: String(message || "scan failed"),
        staleReport: false,
        heading: "Scan failed",
        score: "\u2014",
        verdict: "error",
        retry: true,
      };
    },
    /**
     * Folder-judge availability (shipped in v1.4.4):
     * the Review tab's "Judge scanned project" action is only enabled after
     * a Folder scan produced an in-memory PROJECT REPORT OBJECT
     * ({ files: [...], summary: {...} } — the scanProjectBrowser shape).
     * Pure and DOM-free so test/app.test.js can exercise the disabled /
     * enabled logic with no browser. A dir-path string is never a report.
     */
    projectJudgeState(report) {
      const available = Boolean(report && Array.isArray(report.files) && report.summary);
      return {
        available,
        hint: available
          ? `Folder-judge: ready to judge ${report.summary.filesScanned} scanned file(s) from “${report.root || "this project"}” in the Review tab.`
          : "Folder-judge: run a Folder scan first. The scanned project report can then be judged in the Review tab.",
      };
    },
  };
  if (typeof window !== "undefined") window.SlopAppState = SlopAppState;
  if (typeof globalThis !== "undefined" && globalThis !== window) globalThis.SlopAppState = SlopAppState;

  const els = {
    tabText: document.getElementById("tab-text"),
    tabUrl: document.getElementById("tab-url"),
    tabFolder: document.getElementById("tab-folder"),
    tabReview: document.getElementById("tab-review"),
    paneText: document.getElementById("pane-text"),
    paneUrl: document.getElementById("pane-url"),
    paneFolder: document.getElementById("pane-folder"),
    paneReview: document.getElementById("pane-review"),
    inputText: document.getElementById("input-text"),
    inputUrl: document.getElementById("input-url"),
    inputReview: document.getElementById("input-review"),
    btnScan: document.getElementById("btn-scan"),
    btnSample: document.getElementById("btn-sample"),
    btnPickFolder: document.getElementById("btn-pick-folder"),
    folderFiles: document.getElementById("folder-files"),
    folderStatus: document.getElementById("folder-status"),
    btnJudge: document.getElementById("btn-judge"),
    btnJudgeReuse: document.getElementById("btn-judge-reuse"),
    btnJudgeProject: document.getElementById("btn-judge-project"),
    judgeMode: document.getElementById("judge-mode"),
    judgeProjectStatus: document.getElementById("judge-project-status"),
    judgeError: document.getElementById("judge-error"),
    engineMode: document.getElementById("engine-mode"),
    engineVersion: document.getElementById("engine-version"),
    scanError: document.getElementById("scan-error"),
    results: document.getElementById("results"),
    gaugeFill: document.getElementById("gauge-fill"),
    scoreValue: document.getElementById("score-value"),
    verdictValue: document.getElementById("verdict-value"),
    verdictHeading: document.getElementById("verdict-heading"),
    summaryText: document.getElementById("summary-text"),
    categoryList: document.getElementById("category-list"),
    matchList: document.getElementById("match-list"),
    rewriteBefore: document.getElementById("rewrite-before"),
    rewriteAfter: document.getElementById("rewrite-after"),
    rewriteNote: document.getElementById("rewrite-note"),
    judgeResults: document.getElementById("judge-results"),
    judgeResultsTitle: document.getElementById("judge-results-title"),
    judgeBanner: document.getElementById("judge-banner"),
    judgeVerdict: document.getElementById("judge-verdict"),
    judgeVerdictHeading: document.getElementById("judge-verdict-heading"),
    judgeVerdictReason: document.getElementById("judge-verdict-reason"),
    judgeVerdictNote: document.getElementById("judge-verdict-note"),
    judgeQuestions: document.getElementById("judge-questions"),
    judgeFloor: document.getElementById("judge-floor"),
    judgeFloorChip: document.getElementById("judge-floor-chip"),
    judgeRefusals: document.getElementById("judge-refusals"),
  };

  const SLOP_SAMPLE = `In today's fast-paced world, it's important to note that we truly need to
leverage our robust cutting-edge solutions to navigate the complexities of the
modern landscape. Let me be clear: this game-changer empowers teams to delve
into a seamless journey of transformative innovation.

At its core, the reality is that most people don't know the secret to
unlocking success. What nobody tells you is that the uncomfortable truth is
that synergy matters. Here's the thing: it's not just about technology, it's
about people. The best part: it learns.

Experts agree that studies show this paradigm shift fosters a multifaceted
tapestry of value. Stands as a testament to our meticulous approach, it marks
a pivotal moment. Ultimately, we need to circle back and double down on
low-hanging fruit. Let's dive in!`;

  function showError(message) {
    els.scanError.textContent = message;
    els.scanError.hidden = false;
  }
  function clearError() {
    els.scanError.hidden = true;
  }

  // ── Results-area lifecycle (UX fix, v1.4.1) ───────────────────────────
  // START clears the previous results area; FAILURE renders a DISTINCT
  // error state in the results area (verdict area + summary show the
  // error, with a retry affordance) — the previous report is never left
  // on screen as if it were the new result.
  let retryButton = null;

  function clearResultsArea() {
    const st = SlopAppState.started();
    els.results.hidden = st.resultsHidden;
    els.scoreValue.textContent = "\u2014";
    els.verdictValue.textContent = "\u2014";
    els.verdictHeading.textContent = "Result";
    els.summaryText.textContent = "Run a scan to see the verdict.";
    els.categoryList.innerHTML = "";
    els.matchList.innerHTML = "";
    els.rewriteBefore.textContent = "";
    els.rewriteAfter.textContent = "";
    els.rewriteNote.textContent = "";
    hideRetryButton();
  }

  function hideRetryButton() {
    if (retryButton && retryButton.parentNode) retryButton.parentNode.removeChild(retryButton);
    retryButton = null;
  }

  function ensureRetryButton() {
    if (retryButton) return retryButton;
    retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "btn-primary";
    retryButton.textContent = "Try again";
    retryButton.id = "retry-scan";
    retryButton.addEventListener("click", run);
    const anchor = els.verdictHeading && els.verdictHeading.parentElement;
    (anchor || els.results).appendChild(retryButton);
    return retryButton;
  }

  function renderError(message) {
    // Distinct error state in the results area — never stale results.
    const st = SlopAppState.failed(message);
    els.results.hidden = st.resultsHidden;
    els.scoreValue.textContent = st.score;
    els.verdictValue.textContent = st.verdict;
    els.verdictHeading.textContent = st.heading;
    els.summaryText.textContent = st.error;
    els.categoryList.innerHTML = "";
    els.matchList.innerHTML = "";
    els.rewriteBefore.textContent = "";
    els.rewriteAfter.textContent = "";
    els.rewriteNote.textContent = "There was an error, not a report — the previous results were cleared.";
    ensureRetryButton();
  }

  function setupTabs() {
    const tabs = [els.tabText, els.tabUrl, els.tabFolder, els.tabReview];
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
        const pane = document.getElementById(tab.getAttribute("aria-controls"));
        els.paneText.hidden = tab !== els.tabText;
        els.paneUrl.hidden = tab !== els.tabUrl;
        els.paneFolder.hidden = tab !== els.tabFolder;
        els.paneReview.hidden = tab !== els.tabReview;
      });
    }
  }

  function setEngineMode(text) {
    els.engineMode.textContent = text;
  }

  function detectApiAvailability() {
    // When served by the API, /health exists on the same origin.
    return fetch("health", { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && d.ok === true ? true : false))
      .catch(() => false);
  }

  function attemptApiScan(payload) {
    return fetch("scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `API scan failed (${r.status})`);
      }
      return r.json();
    });
  }

  function colorForScore(score) {
    if (score <= 9) return "#1a7f4b";
    if (score <= 29) return "#0a8f8f";
    if (score <= 59) return "#b27b0c";
    return "#c2410c";
  }

  function renderReport(report) {
    hideRetryButton();
    const score = report.score;
    const verdict = report.verdict;

    els.results.hidden = false;
    els.scoreValue.textContent = String(score);
    els.verdictValue.textContent = verdict;

    const circumference = 2 * Math.PI * 52;
    els.gaugeFill.style.strokeDasharray = String(circumference);
    els.gaugeFill.style.strokeDashoffset = String(circumference * (1 - score / 100));
    els.gaugeFill.style.stroke = colorForScore(score);

    els.verdictHeading.textContent =
      report.clean ? "Clean" : verdict === "light" ? "Light slop" : verdict === "moderate" ? "Moderate slop" : "Heavy slop";

    const counts = report.categories.map((c) => `${c.count}× ${c.name}`).join(", ");
    els.summaryText.textContent =
      report.clean
        ? `No AI tells found in ${report.input.length.toLocaleString()} characters.`
        : `${report.matches.length} tell(s) found: ${counts.slice(0, 200)}.`;

    // Categories
    els.categoryList.innerHTML = "";
    for (const c of report.categories) {
      const li = document.createElement("li");
      const mk = (tag, cls, text) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        el.textContent = text;
        return el;
      };
      const name = mk("span", "cat-name", c.name);
      const count = mk("span", "cat-count", `${c.count} · ${c.points} pts`);
      const bar = document.createElement("div");
      bar.className = "cat-bar";
      const fill = document.createElement("i");
      const maxPoints = Math.max(...report.categories.map((x) => x.points), 1);
      fill.style.width = `${Math.round((c.points / maxPoints) * 100)}%`;
      bar.appendChild(fill);
      li.appendChild(name);
      li.appendChild(count);
      li.appendChild(bar);
      els.categoryList.appendChild(li);
    }

    // Matches
    els.matchList.innerHTML = "";
    for (const m of report.matches.slice(0, 120)) {
      const li = document.createElement("li");
      const head = document.createElement("div");
      head.className = "match-head";

      const sev = document.createElement("span");
      sev.className = `sev sev-${m.severity}`;
      sev.textContent = `S${m.severity}`;
      head.appendChild(sev);

      const id = document.createElement("span");
      id.className = "match-id";
      id.textContent = m.id;
      head.appendChild(id);

      const cat = document.createElement("span");
      cat.className = "match-category";
      cat.textContent = m.category;
      head.appendChild(cat);

      const snippet = document.createElement("div");
      snippet.className = "match-snippet";
      snippet.textContent = m.snippet;

      const fixEl = document.createElement("p");
      fixEl.className = "match-fix";
      fixEl.textContent = m.rewrite ? `Fix: ${m.fix} → ${m.rewrite}` : `Fix: ${m.fix}`;

      li.appendChild(head);
      li.appendChild(snippet);
      li.appendChild(fixEl);
      els.matchList.appendChild(li);
    }
    if (report.matches.length > 120) {
      const more = document.createElement("li");
      more.textContent = `… and ${report.matches.length - 120} more matches (${report.matches.length} total).`;
      els.matchList.appendChild(more);
    }

    // Rewrite preview (text-only inputs)
    els.rewriteBefore.textContent = "";
    els.rewriteAfter.textContent = "";
    els.rewriteNote.textContent = "";
    if (report.input.type === "text" && report.source && typeof report.source.length === "number") {
      const original = els.inputText ? els.inputText.value : "";
      if (original) {
        const preview = rewriter.rewriteText(original);
        els.rewriteBefore.textContent = original;
        if (preview.changed) {
          els.rewriteAfter.textContent = preview.text;
          els.rewriteNote.textContent = `${preview.changes.length} safe change(s) applied.`;
        } else {
          els.rewriteAfter.textContent = original;
          els.rewriteNote.textContent = "No safe automatic rewrites; see fix suggestions above.";
        }
      }
    }
  }

  async function scanLocal() {
    const input = els.inputText.value.trim();
    if (!input) {
      showError("Paste some text first, or switch to the URL tab.");
      return null;
    }
    const report = scanner.scanText(input);
    report.source = { type: "text", length: input.length };
    setEngineMode("engine: in-browser (local)");
    return { report, input };
  }

  async function scanUrlLocal(url) {
    const res = await fetch(url, { headers: { "User-Agent": "LazynextSlopChecker/1.0 (+https://lazynext.com)" }, redirect: "follow" });
    if (!res.ok) throw new Error(`could not fetch URL (HTTP ${res.status})`);
    const html = await res.text();
    if (html.length > 2_000_000) throw new Error("document too large (limit 2MB)");
    const report = scanner.scanHtml(html);
    setEngineMode("engine: in-browser (direct fetch)");
    report.source = { type: "url", url };
    return { report, input: html };
  }

  // ── Folder / project scan ────────────────────────────────────────────
  // Picked files are held in memory (never uploaded). File System Access
  // API (showDirectoryPicker) when available; multiple <input type=file>
  // as the fallback. The browser-safe project scanner pools them with the
  // same prose/markup/styles/code lenses as the CLI --dir mode.
  let pickedProject = null; // { root, files: [{name, rel, file}] }
  let lastProjectReport = null; // the project REPORT object from the most recent folder scan (judged via the Review tab)

  async function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`could not read ${file.name}`));
      reader.readAsText(file);
    });
  }

  async function handleDirectory(handle, prefix) {
    const out = [];
    const entries = handle.entries ? handle.entries() : [];
    for await (const [, entry] of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        out.push(...(await handleDirectory(entry, rel)));
      } else if (entry.kind === "file") {
        const file = await entry.getFile();
        out.push({ name: entry.name, rel, file });
      }
    }
    return out;
  }

  async function pickFolder() {
    const picked = [];
    if (window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker();
        setFolderStatus("Reading folder…");
        const entries = await handleDirectory(handle, "");
        for (const e of entries) picked.push(e);
        return { root: handle.name || "folder", files: picked };
      } catch (err) {
        if (err && err.name === "AbortError") return null; // user cancelled
        // Fall through to the file input (some environments reject the API).
      }
    }
    // Fallback: multiple file selection.
    setFolderStatus("Select the text/code files to scan…");
    const files = await new Promise((resolve) => {
      const input = els.folderFiles;
      input.value = "";
      input.click();
      input.addEventListener(
        "change",
        () => resolve(Array.from(input.files || [])),
        { once: true }
      );
    });
    for (const f of files) picked.push({ name: f.name, rel: f.webkitRelativePath || f.name, file: f });
    if (picked.length === 0) return null;
    return { root: "selection", files: picked };
  }

  function setFolderStatus(text) {
    if (els.folderStatus) els.folderStatus.textContent = text;
  }

  async function loadProjectFiles(picked) {
    const items = [];
    for (const e of picked.files) {
      const text = await readTextFile(e.file).catch(() => "");
      if (text !== "") items.push({ name: e.name, rel: e.rel, text });
    }
    return items;
  }

  function renderProjectReport(project) {
    hideRetryButton();
    els.results.hidden = false;
    const s = project.summary;
    els.scoreValue.textContent = String(s.score);
    els.verdictValue.textContent = s.verdict;
    const circumference = 2 * Math.PI * 52;
    els.gaugeFill.style.strokeDasharray = String(circumference);
    els.gaugeFill.style.strokeDashoffset = String(circumference * (1 - s.score / 100));
    els.gaugeFill.style.stroke = colorForScore(s.score);
    els.verdictHeading.textContent =
      s.score <= 9 ? "Clean" : s.verdict === "light" ? "Light slop" : s.verdict === "moderate" ? "Moderate slop" : "Heavy slop";
    els.summaryText.textContent =
      `${s.filesScanned} file(s) scanned, ${s.filesWithHits} with hits; ${s.totalMatches} tell(s); score ${s.score}/100`;

    // Categories (pooled)
    els.categoryList.innerHTML = "";
    for (const c of project.categories) {
      const li = document.createElement("li");
      const mk = (tag, cls, text) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        el.textContent = text;
        return el;
      };
      const name = mk("span", "cat-name", c.id);
      const count = mk("span", "cat-count", `${c.count} · ${c.points} pts`);
      const bar = document.createElement("div");
      bar.className = "cat-bar";
      const fill = document.createElement("i");
      const maxPoints = Math.max(...project.categories.map((x) => x.points), 1);
      fill.style.width = `${Math.round((c.points / maxPoints) * 100)}%`;
      bar.appendChild(fill);
      li.appendChild(name);
      li.appendChild(count);
      li.appendChild(bar);
      els.categoryList.appendChild(li);
    }

    // Top files
    els.matchList.innerHTML = "";
    if (project.topFiles.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No files above the clean floor. Good work.";
      els.matchList.appendChild(li);
    }
    for (const f of project.topFiles) {
      const li = document.createElement("li");
      const head = document.createElement("div");
      head.className = "match-head";
      const sev = document.createElement("span");
      sev.className = `sev sev-${f.points >= 12 ? 3 : f.points >= 6 ? 2 : 1}`;
      sev.textContent = `${f.score}/100`;
      head.appendChild(sev);
      const id = document.createElement("span");
      id.className = "match-id";
      id.textContent = `${f.file} (${f.kind})`;
      head.appendChild(id);
      const cat = document.createElement("span");
      cat.className = "match-category";
      cat.textContent = `${f.matches} match(es)`;
      head.appendChild(cat);
      li.appendChild(head);
      const snippet = document.createElement("div");
      snippet.className = "match-snippet";
      snippet.textContent = `verdict: ${f.verdict}`;
      li.appendChild(snippet);
      els.matchList.appendChild(li);
    }
    els.rewriteBefore.textContent = "";
    els.rewriteAfter.textContent = "";
    els.rewriteNote.textContent = "Project scans report pooled per-file findings; the rewrite preview applies to single texts.";
  }

  async function scanFolderLocal() {
    const picked = pickedProject || (await pickFolder());
    if (!picked || !picked.files || picked.files.length === 0) return null;
    pickedProject = picked;
    setFolderStatus(`Scanning ${picked.files.length} file(s)…`);
    const items = await loadProjectFiles(picked);
    if (items.length === 0) {
      showError("No text/code files were picked (or every file was unreadable).");
      return null;
    }
    const project = projectScanner.scanProjectBrowser(items, { root: picked.root });
    setEngineMode(`engine: in-browser (project: ${picked.root}, ${project.summary.filesScanned} files)`);
    return project;
  }

  // ── Review tab (in-browser judgement checklist, v1.4.3) ─────────────────
  // Runs window.SlopJudge (src/judge-browser.js — the browser-safe twin of
  // src/judge.js) over the pasted copy: 5-question review, craft-floor
  // gate, refusal scaffolds, machine PASS|REVIEW|REFUSE. Deterministic,
  // same verdict as --judge / POST /judge for the same input.
  function setJudgeError(message) {
    els.judgeError.textContent = message;
    els.judgeError.hidden = !message;
  }

  function judgeVerdictClass(verdict) {
    return verdict === "PASS" ? "judge-pass" : verdict === "REFUSE" ? "judge-refuse" : "judge-review";
  }

  function renderJudgeReport(report) {
    els.judgeResults.hidden = false;
    els.judgeResultsTitle.textContent =
      report.input.type === "project" ? "Project review" : "Review verdict";
    const v = report.summary.verdict;
    els.judgeBanner.className = `judge-banner ${judgeVerdictClass(v)}`;
    els.judgeVerdict.textContent = v;
    els.judgeVerdictHeading.textContent =
      v === "PASS"
        ? "Nothing machine-flagged — run the human checklist below"
        : v === "REFUSE"
          ? "Craft floor not met — do not ship"
          : "Machine objections found — fix before it ships";
    els.judgeVerdictReason.textContent = report.summary.reasons.join("  ·  ");

    els.judgeVerdictNote.textContent = report.summary.note;
    els.judgeFloorChip.textContent = report.craftFloorMet ? "floor met" : "floor NOT met";

    // 5-question review
    els.judgeQuestions.innerHTML = "";
    report.fiveQuestionReview.forEach((q, i) => {
      const li = document.createElement("li");
      const head = document.createElement("div");
      head.className = "question-head";
      const strong = document.createElement("strong");
      strong.textContent = `${i + 1}. ${q.question}`;
      head.appendChild(strong);
      li.appendChild(head);

      const signalsUl = document.createElement("ul");
      signalsUl.className = "question-signals";
      if (q.signals.length === 0) {
        const none = document.createElement("li");
        none.className = "question-signal-none";
        none.textContent = "no machine evidence detected for this question";
        signalsUl.appendChild(none);
      } else {
        for (const s of q.signals) {
          const sig = document.createElement("li");
          const id = document.createElement("code");
          id.textContent = s.id;
          sig.appendChild(id);
          sig.appendChild(document.createTextNode(` ${s.count}×`));
          signalsUl.appendChild(sig);
        }
      }
      li.appendChild(signalsUl);

      const pass = document.createElement("p");
      pass.className = "question-pass-looks";
      pass.textContent = `Pass looks like: ${q.verdictHint}`;
      li.appendChild(pass);

      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Reviewer hints";
      details.appendChild(summary);
      const hintsUl = document.createElement("ul");
      hintsUl.className = "question-hints";
      for (const h of q.hints) {
        const hi = document.createElement("li");
        hi.textContent = h;
        hintsUl.appendChild(hi);
      }
      details.appendChild(hintsUl);
      li.appendChild(details);

      els.judgeQuestions.appendChild(li);
    });

    // Craft floor
    els.judgeFloor.innerHTML = "";
    for (const f of report.craftFloor) {
      const li = document.createElement("li");
      li.className = `floor-item ${f.machine === "flag" ? "floor-flag" : f.machine === "ok" ? "floor-ok" : "floor-human"}`;

      const head = document.createElement("div");
      head.className = "floor-head";
      const strong = document.createElement("strong");
      strong.textContent = f.name;
      head.appendChild(strong);
      const chip = document.createElement("span");
      chip.className = "floor-chip";
      chip.textContent =
        f.machine === "ok" ? "machine ✓ ok" : f.machine === "flag" ? "machine ✗ flagged" : "human step";
      head.appendChild(chip);
      li.appendChild(head);

      const desc = document.createElement("p");
      desc.className = "floor-desc";
      desc.textContent = f.desc;
      li.appendChild(desc);

      if (f.evidence.length > 0) {
        const ev = document.createElement("p");
        ev.className = "floor-evidence";
        ev.textContent = `Machine evidence: ${f.evidence.join(", ")}`;
        li.appendChild(ev);
      }

      if (f.humanCheckbox) {
        const label = document.createElement("label");
        label.className = "floor-human-step";
        const box = document.createElement("input");
        box.type = "checkbox";
        label.appendChild(box);
        label.appendChild(document.createTextNode(` Human step — verify: ${f.guidance}`));
        li.appendChild(label);
      }

      els.judgeFloor.appendChild(li);
    }

    renderSoftTells(report);

    // Refusal scaffolds
    els.judgeRefusals.innerHTML = "";
    for (const s of report.refusalScaffolds) {
      const li = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = s.name;
      li.appendChild(name);
      const when = document.createElement("p");
      when.className = "floor-desc";
      when.textContent = s.when;
      li.appendChild(when);
      const text = document.createElement("p");
      text.className = "refusal-text";
      text.textContent = s.text;
      li.appendChild(text);
      els.judgeRefusals.appendChild(li);
    }
  }

  /**
   * Advisory soft tells. The section is created here so the page shell
   * (index.html) stays unchanged. The advisory score is not the verdict.
   */
  function renderSoftTells(report) {
    const refusalSection = els.judgeRefusals.closest("section");
    let host = els.judgeResults.querySelector("[data-soft-tells]");
    if (!host) {
      host = document.createElement("section");
      host.className = "panel";
      host.dataset.softTells = "1";
      const heading = document.createElement("h3");
      heading.textContent = "Soft tells ";
      const chip = document.createElement("span");
      chip.className = "judge-chip";
      chip.textContent = "advisory";
      heading.appendChild(chip);
      host.appendChild(heading);
      const note = document.createElement("p");
      note.className = "hint soft-tells-note";
      host.appendChild(note);
      const list = document.createElement("ul");
      list.className = "soft-tells-list";
      host.appendChild(list);
      refusalSection.parentElement.insertBefore(host, refusalSection);
    }
    const note = host.querySelector(".soft-tells-note");
    const list = host.querySelector(".soft-tells-list");
    list.textContent = "";
    const soft = report.softTells;
    if (!soft) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    if (soft.skipped) {
      note.textContent = soft.skipped;
      return;
    }
    if (!soft.signals || soft.signals.length === 0) {
      note.textContent = `No structural soft tells. Advisory score ${soft.advisoryScore}. This number is not part of the scan score or the verdict.`;
      return;
    }
    note.textContent = `Advisory score ${soft.advisoryScore}/100. Not added to the scan score. The verdict above does not use these signals.`;
    for (const s of soft.signals) {
      const li = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = s.id;
      li.appendChild(code);
      li.appendChild(document.createTextNode(` ${s.detail}`));
      list.appendChild(li);
    }
  }

  /** Auto-classify pasted review input: markup looking like HTML scans as html. */
  function judgeInputKind(text) {
    const trimmed = text.trim();
    const looksHtml = trimmed.startsWith("<") && /<\/[a-z][\s\S]*>/i.test(trimmed.slice(0, 5000));
    return looksHtml ? "html" : "text";
  }

  async function runReview() {
    const input = els.inputReview.value.trim();
    if (!input) {
      setJudgeError("Paste some copy to review first (or use the last scanned text).");
      els.judgeResults.hidden = true;
      return;
    }
    if (!judgeEngine) {
      setJudgeError("Review engine failed to load (src/judge-browser.js did not load).");
      return;
    }
    setJudgeError("");
    els.btnJudge.disabled = true;
    els.btnJudge.textContent = "Reviewing…";
    els.judgeMode.textContent = "engine: in-browser (local)";
    try {
      const kind = judgeInputKind(input);
      const report = kind === "html" ? judgeEngine.judgeReport({ html: input }) : judgeEngine.judgeReport({ text: input });
      renderJudgeReport(report);
      if (kind === "html") els.judgeMode.textContent = "engine: in-browser (html floor machine-checked)";
    } catch (err) {
      els.judgeResults.hidden = true;
      setJudgeError(`Review failed: ${err && err.message ? err.message : err}`);
    } finally {
      els.btnJudge.disabled = false;
      els.btnJudge.textContent = "Run review";
    }
  }

  function reuseLastScannedText() {
    const lastText = els.inputText.value.trim();
    if (!lastText) {
      setJudgeError("No previous text scan to reuse — paste some copy into the “Paste text” tab first, or into this box directly.");
      return;
    }
    setJudgeError("");
    els.inputReview.value = lastText;
    els.inputReview.focus();
  }

  // ── Folder-judge path (shipped in v1.4.4) ────────────────────────────
  // The Review tab can judge a whole scanned project: after a Folder scan
  // completed, `lastProjectReport` holds the in-memory project report
  // object (scanProjectBrowser shape) and `runProjectReview()` sends THAT
  // OBJECT through the judge engine's `project` path — never a directory
  // path (the browser has no filesystem; src/judge-browser.js rejects
  // strings with the documented contract error). The button is disabled
  // until a report exists, driven by the pure SlopAppState helper.
  function updateProjectJudgeAvailability() {
    const st = SlopAppState.projectJudgeState(lastProjectReport);
    if (els.btnJudgeProject) {
      els.btnJudgeProject.disabled = !st.available;
      els.btnJudgeProject.title = st.available
        ? `Judge the scanned project report (${lastProjectReport.summary.filesScanned} file(s)).`
        : "Run a Folder scan first, then judge the whole scanned project.";
    }
    if (els.judgeProjectStatus) els.judgeProjectStatus.textContent = st.hint;
    return st;
  }

  async function runProjectReview() {
    if (!judgeEngine) {
      setJudgeError("Review engine failed to load (src/judge-browser.js did not load).");
      return;
    }
    const st = SlopAppState.projectJudgeState(lastProjectReport);
    if (!st.available) {
      setJudgeError("No scanned project to judge. Run a Folder scan first.");
      els.judgeResults.hidden = true;
      return;
    }
    setJudgeError("");
    if (els.btnJudgeProject) {
      els.btnJudgeProject.disabled = true;
      els.btnJudgeProject.textContent = "Reviewing project…";
    }
    els.judgeMode.textContent = `engine: in-browser (project: ${lastProjectReport.root || "folder"})`;
    try {
      const report = judgeEngine.judgeReport({ project: lastProjectReport });
      renderJudgeReport(report);
      els.judgeMode.textContent = "engine: in-browser (project floor machine-checked)";
    } catch (err) {
      els.judgeResults.hidden = true;
      setJudgeError(`Review failed: ${err && err.message ? err.message : err}`);
    } finally {
      if (els.btnJudgeProject) {
        els.btnJudgeProject.disabled = false;
        els.btnJudgeProject.textContent = "Judge scanned project";
      }
      updateProjectJudgeAvailability();
    }
  }

  function run() {
    if (els.tabReview.getAttribute("aria-selected") === "true") return runReview();
    const activePaneId =
      els.tabText.getAttribute("aria-selected") === "true" ? "text"
        : els.tabUrl.getAttribute("aria-selected") === "true" ? "url"
          : "folder";
    clearError();
    clearResultsArea(); // UX fix: a scan START clears the previous results area
    els.btnScan.disabled = true;
    els.btnScan.textContent = "Scanning…";
    const finishProject = (project) => {
      els.btnScan.disabled = false;
      els.btnScan.textContent = "Scan for slop";
      lastProjectReport = project; // the Review tab can now judge this project
      updateProjectJudgeAvailability();
      renderProjectReport(project);
    };
    const finish = (result) => {
      els.btnScan.disabled = false;
      els.btnScan.textContent = "Scan for slop";
      renderReport(result.report);
    };
    const fail = (message) => {
      els.btnScan.disabled = false;
      els.btnScan.textContent = "Scan for slop";
      // Keep the inline error line (the URL tab's CORS-aware tip rides on
      // this message) AND render the distinct error state in the results
      // area — never stale results.
      showError(message);
      renderError(message || "Scan failed.");
    };

    (async () => {
      const apiAvailable = await detectApiAvailability().catch(() => false);

      if (activePaneId === "folder") {
        lastProjectReport = null; // a fresh folder scan invalidates the previous report
        updateProjectJudgeAvailability();
        const project = await scanFolderLocal();
        if (!project) return fail("Choose a folder or select files first.");
        return finishProject(project);
      }

      if (activePaneId === "text") {
        const local = await scanLocal();
        if (!local) return fail("");
        if (apiAvailable) {
          // Server-side scan keeps input handling identical and returns the
          // same report shape; reuse it when reachable.
          return attemptApiScan({ text: local.input, rewrite: true })
            .then((report) => finish({ report }))
            .catch(() => finish(local));
        }
        return finish(local);
      }

      const url = els.inputUrl.value.trim();
      if (!/^https?:\/\//i.test(url)) {
        return fail("Enter a valid http(s) URL (e.g. https://example.com).");
      }

      // URL scan: prefer the API (server-side fetch), fall back to a direct
      // browser fetch which may hit CORS limits.
      if (apiAvailable) {
        try {
          const report = await attemptApiScan({ url });
          setEngineMode("engine: API (server-side fetch)");
          return finish({ report });
        } catch (err) {
          // fall through to direct fetch
        }
      }
      try {
        const result = await scanUrlLocal(url);
        return finish(result);
      } catch (err) {
        return fail(`URL scan failed: ${err.message}. Tip: served via the API, URL scans run server-side; a bare browser fetch may be blocked by CORS.`);
      }
    })();
  }

  function loadSample() {
    els.tabText.click();
    els.inputText.value = SLOP_SAMPLE;
    clearError();
  }

  // ----------------------------------------------------------------------
  // Design reviews panel (rendered-tier checks in the browser)
  // ----------------------------------------------------------------------
  // The "Design reviews" tab pastes a computed snapshot JSON and runs the
  // pure r-* checks via window.SlopRenderChecks. The two modules it needs
  // (data/profiles.js, src/render-checks.js) are loaded ON DEMAND so the
  // original index.html script list stays untouched — the panel is injected
  // here entirely, keeping the concurrent web-checker smoke test stable.
  let renderEngineLoaded = false;

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-lzrender="1"][src="' + src + '"]');
      if (existing && window.SlopRenderChecks) { resolve(); return; }
      const s = document.createElement("script");
      s.src = src;
      s.dataset.lzrender = "1";
      s.onload = resolve;
      s.onerror = () => reject(new Error("could not load " + src));
      document.head.appendChild(s);
    });
  }

  async function loadRenderEngine() {
    if (window.SlopRenderChecks) { renderEngineLoaded = true; return; }
    if (renderEngineLoaded) return;
    // Order matters: profiles.js first (render-checks reads the global).
    await loadScriptOnce("../data/profiles.js");
    await loadScriptOnce("../src/render-checks.js");
    if (!window.SlopRenderChecks) throw new Error("rendered-checks engine did not load");
    renderEngineLoaded = true;
  }

  function buildDesignReviewsPanel() {
    if (document.getElementById("design-reviews")) return;
    const sec = document.createElement("section");
    sec.id = "design-reviews";
    sec.className = "panel design-reviews";
    sec.innerHTML =
      "<h2>Design reviews <span class='design-review-chip'>rendered-tier</span></h2>" +
      "<p class='hint'>Paste a computed snapshot (see <code>src/render-checks.js</code> for the shape: " +
      "<code>{ elements: [...] }</code> — each element carries tag/role/text/classes/style) and run the " +
      "11 rendered checks: kicker size, gradient text, tracked caps, glued arrows, scrolling strips, hidden " +
      "reveals, the 1280×800 fold budget, screen word budget, section rhythm, fake progress, and WCAG contrast.</p>" +
      "<textarea id=\"snapshot-input\" rows=\"7\" spellcheck=\"false\" " +
      "placeholder='{\n  \"viewport\": { \"width\": 1280, \"height\": 800 },\n  \"documentStyle\": { \"backgroundColor\": \"#ffffff\" },\n  \"elements\": [ { \"tag\": \"h1\", \"text\": \"...\", \"style\": { \"fontSizePx\": 40, \"color\": \"#6366f1\", \"backgroundImage\": \"linear-gradient(135deg,#6366f1,#a855f7)\", \"backgroundClip\": \"text\", \"rect\": { \"x\": 0, \"y\": 0, \"w\": 400, \"h\": 50, \"viewportY\": 0 } } } ]\n}'></textarea>" +
      "<div class='actions'><button type='button' id='btn-snapshot-scan' class='btn-primary'>Check design tells</button>" +
      "<button type='button' id='btn-snapshot-sample' class='btn-quiet'>Load a slop snapshot</button>" +
      "<span id='render-engine-mode' class='engine-mode'></span></div>" +
      "<p id='snapshot-error' class='error' hidden></p>" +
      "<div id='snapshot-results' class='results' hidden>" +
      "<div class='score-row'><div class='gauge'><svg viewBox='0 0 120 120' role='img' aria-label='Design review score'>" +
      "<circle class='gauge-track' cx='60' cy='60' r='52' /><circle id='snapshot-gauge-fill' class='gauge-fill' cx='60' cy='60' r='52' /></svg>" +
      "<div class='gauge-label'><strong id='snapshot-score'>0</strong><span>/100</span><em id='snapshot-verdict'>—</em></div></div>" +
      "<div class='score-summary'><h3 id='snapshot-heading'>Design review</h3>" +
      "<p id='snapshot-summary'></p></div></div>" +
      "<div class='match-list-wrap'><ul id='snapshot-match-list' class='match-list'></ul></div></div>";
    const footer = document.querySelector("footer.site-footer");
    if (footer && footer.parentNode) footer.parentNode.insertBefore(sec, footer);
    else document.querySelector("main")?.appendChild(sec) || document.body.appendChild(sec);

    const input = sec.querySelector("#snapshot-input");
    const scanBtn = sec.querySelector("#btn-snapshot-scan");
    const sampleBtn = sec.querySelector("#btn-snapshot-sample");
    const err = sec.querySelector("#snapshot-error");
    const results = sec.querySelector("#snapshot-results");
    const modeEl = sec.querySelector("#render-engine-mode");

    const SNAPSHOT_SAMPLE = JSON.stringify({
      viewport: { width: 1280, height: 800 },
      documentStyle: { backgroundColor: "#ffffff" },
      elements: [
        { tag: "section", role: "region", text: "Hero", style: { fontSizePx: 14, rect: { x: 0, y: 0, w: 1280, h: 260, viewportY: 0 }, display: "block", visibility: "visible", opacity: 1 } },
        { tag: "p", text: "The kicker", classes: ["kicker"], style: { fontSizePx: 24, backgroundColor: "#ffffff", color: "#111111", rect: { x: 20, y: 20, w: 400, h: 30, viewportY: 20 }, display: "block", visibility: "visible", opacity: 1 }, parents: [0], depth: 1 },
        { tag: "p", text: "Body paragraph text that is long enough to measure against the kicker", style: { fontSizePx: 16, backgroundColor: "#ffffff", color: "#111111", rect: { x: 20, y: 60, w: 400, h: 48, viewportY: 60 }, display: "block", visibility: "visible", opacity: 1 }, parents: [0], depth: 1 },
        { tag: "h1", role: "heading", text: "Transform Your World Today", style: { fontSizePx: 44, backgroundImage: "linear-gradient(135deg,#6366f1,#a855f7)", backgroundClip: "text", color: "transparent", rect: { x: 20, y: 120, w: 560, h: 60, viewportY: 120 }, display: "block", visibility: "visible", opacity: 1 }, parents: [0], depth: 1 },
        { tag: "p", text: "LEARN MORE\u2192", style: { fontSizePx: 14, textTransform: "uppercase", letterSpacingEm: 0.4, color: "#111111", backgroundColor: "#ffffff", rect: { x: 20, y: 200, w: 140, h: 20, viewportY: 200 }, display: "block", visibility: "visible", opacity: 1 }, parents: [0], depth: 1 },
        { tag: "p", text: "Gray on white, very low contrast indeed", style: { fontSizePx: 16, fontWeight: 400, color: "#8a8a8a", backgroundColor: "#ffffff", rect: { x: 20, y: 230, w: 420, h: 24, viewportY: 230 }, display: "block", visibility: "visible", opacity: 1 }, parents: [0], depth: 1 },
      ],
    }, null, 2);

    sampleBtn.addEventListener("click", () => {
      input.value = SNAPSHOT_SAMPLE;
      err.hidden = true;
    });

    scanBtn.addEventListener("click", async () => {
      err.hidden = true;
      const text = input.value.trim();
      if (!text) { err.textContent = "Paste a snapshot JSON first."; err.hidden = false; return; }
      let snapshot;
      try {
        snapshot = JSON.parse(text);
      } catch (e) {
        err.textContent = "Snapshot is not valid JSON: " + e.message;
        err.hidden = false;
        return;
      }
      if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.elements)) {
        err.textContent = "Snapshot must be an object with an elements array (see src/render-checks.js).";
        err.hidden = false;
        return;
      }
      scanBtn.disabled = true;
      scanBtn.textContent = "Checking…";
      modeEl.textContent = "engine: loading…";
      try {
        await loadRenderEngine();
        modeEl.textContent = "engine: in-browser (pure checks)";
        const report = window.SlopRenderChecks.scanRender(snapshot);
        renderSnapshotReport(report);
      } catch (e) {
        err.textContent = "Design check failed: " + (e && e.message ? e.message : e);
        err.hidden = false;
      } finally {
        scanBtn.disabled = false;
        scanBtn.textContent = "Check design tells";
      }
    });

    function renderSnapshotReport(report) {
      results.hidden = false;
      const score = report.score;
      const color = colorForScore(score);
      sec.querySelector("#snapshot-score").textContent = String(score);
      sec.querySelector("#snapshot-verdict").textContent = report.verdict;
      const circ = 2 * Math.PI * 52;
      const fill = sec.querySelector("#snapshot-gauge-fill");
      fill.style.strokeDasharray = String(circ);
      fill.style.strokeDashoffset = String(circ * (1 - score / 100));
      fill.style.stroke = color;
      sec.querySelector("#snapshot-heading").textContent = report.clean ? "Clean" : "Design tells found";
      sec.querySelector("#snapshot-summary").textContent =
        `${report.input.elements} element(s) · ${report.matches.length} matching tell(s) · ${report.categories.map((c) => `${c.count}× ${c.name}`).slice(0, 4).join(", ")}`;
      const list = sec.querySelector("#snapshot-match-list");
      list.innerHTML = "";
      if (report.matches.length === 0) {
        const li = document.createElement("li");
        li.textContent = "No rendered-tier tells found. Clean design.";
        list.appendChild(li);
        return;
      }
      for (const m of report.matches.slice(0, 60)) {
        const li = document.createElement("li");
        const head = document.createElement("div");
        head.className = "match-head";
        const sev = document.createElement("span");
        sev.className = `sev sev-${m.severity}`;
        sev.textContent = `S${m.severity}`;
        head.appendChild(sev);
        const id = document.createElement("span");
        id.className = "match-id";
        id.textContent = m.id;
        head.appendChild(id);
        const cat = document.createElement("span");
        cat.className = "match-category";
        cat.textContent = m.category;
        head.appendChild(cat);
        li.appendChild(head);
        const snippet = document.createElement("div");
        snippet.className = "match-snippet";
        snippet.textContent = m.snippet || "(no text)";
        li.appendChild(snippet);
        if (m.detail) {
          const det = document.createElement("p");
          det.className = "match-fix";
          det.textContent = m.detail;
          li.appendChild(det);
        }
        if (m.fix) {
          const fx = document.createElement("p");
          fx.className = "match-fix";
          fx.textContent = "Fix: " + m.fix;
          li.appendChild(fx);
        }
        list.appendChild(li);
      }
      if (report.matches.length > 60) {
        const more = document.createElement("li");
        more.textContent = `… and ${report.matches.length - 60} more matches.`;
        list.appendChild(more);
      }
    }
  }

  function init() {
    if (!scanner || !rewriter || !projectScanner) {
      showError("Engine failed to load. Serve this page via `node api/server.js` so the engine files resolve.");
      return;
    }
    els.engineVersion.textContent = `engine v${scanner.version} · ${scanner.patterns.length} patterns · ${scanner.categories.length} categories`;
    setupTabs();
    els.btnScan.addEventListener("click", run);
    els.btnSample.addEventListener("click", loadSample);
    if (els.btnJudge) els.btnJudge.addEventListener("click", runReview);
    if (els.btnJudgeReuse) els.btnJudgeReuse.addEventListener("click", reuseLastScannedText);
    if (els.btnJudgeProject) els.btnJudgeProject.addEventListener("click", runProjectReview);
    updateProjectJudgeAvailability(); // initial state: disabled until a folder scan holds a report
    if (els.btnPickFolder) {
      els.btnPickFolder.addEventListener("click", async () => {
        const picked = await pickFolder();
        if (!picked) return;
        pickedProject = picked;
        setFolderStatus(`${picked.files.length} file(s) picked — press “Scan for slop”.`);
        clearError();
      });
    }
    buildDesignReviewsPanel();
    detectApiAvailability().then((ok) => {
      setEngineMode(ok ? "engine: API + in-browser" : "engine: in-browser (offline)");
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();