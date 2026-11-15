"use strict";
/**
 * Lazynext AI Slop Checker — pattern corpus.
 *
 * (see header above for the full description)
 *
 * UMD-style module: CommonJS on Node (module.exports) and a browser global
 * (window.SlopPatterns) when loaded via <script> in the no-build web
 * checker. The IIFE keeps top-level identifiers out of the shared global
 * lexical scope so the corpus, scanner and rewriter can be loaded as three
 * classic scripts without "already declared" collisions.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopPatterns = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {

const PATTERN_CATEGORIES = [
  {
    id: "word-ban",
    name: "Banned words",
    desc: "Words and phrases that have become AI-dialect through heavy overuse. They signal a model filling a slot rather than a person saying something precise.",
  },
  {
    id: "filler-phrases",
    name: "Empty filler phrases",
    desc: "Phrases that burn words to announce a point instead of making it. In AI copy they arrive in clusters, each one a small act of throat-clearing.",
  },
  {
    id: "business-jargon",
    name: "Business jargon",
    desc: "Management-speak terms that flatten meaning. AI reaches for them as a shortcut to sounding 'professional'.",
  },
  {
    id: "throat-clearing",
    name: "Throat-clearing openers",
    desc: "Announcement phrases that delay the actual statement. They train the reader to skip the first sentence.",
  },
  {
    id: "faux-insight",
    name: "Faux-insight setups",
    desc: "Setups that flatter the writer as the lone expert ('what nobody tells you'). The setup is content-free; the claim should stand alone.",
  },
  {
    id: "binary-contrast",
    name: "Binary contrasts",
    desc: "The telegraphed reversal: 'It's not X. It's Y.' AI uses it as a rhythm crutch instead of stating the point directly.",
  },
  {
    id: "colon-reveal",
    name: "Colon reveals",
    desc: "A noun phrase, a colon, then a dramatic lowercase reveal. Drama by grammar, not by content.",
  },
  {
    id: "importance-puffery",
    name: "Importance puffery",
    desc: "Phrases that announce importance instead of showing it: 'marks a pivotal moment', 'stands as a testament'.",
  },
  {
    id: "weasel-attribution",
    name: "Weasel attribution",
    desc: "Unnamed authorities: 'experts agree', 'studies show'. AI invents these to borrow credibility without a citation.",
  },
  {
    id: "fake-strong-verb",
    name: "Fake-strong verbs",
    desc: "Verbal tics that puff up plain actions ('made a decision', 'serves as a centralized hub'). A direct verb is stronger.",
  },
  {
    id: "adverb-overuse",
    name: "Empty adverbs",
    desc: "Often-empty intensifiers and hedges that add no meaning. AI sprinkles them on as seasoning.",
  },
  {
    id: "rhetorical-setup",
    name: "Rhetorical setups",
    desc: "Socratic posturing and self-answered questions ('what if I told you', 'think about it').",
  },
  {
    id: "negative-listing",
    name: "Negative listings",
    desc: "Listing what something is NOT before revealing what it is. A rhetorical striptease.",
  },
  {
    id: "dramatic-fragment",
    name: "Dramatic fragmentation",
    desc: "Sentence fragments stacked for manufactured profundity: 'X. And Y. And Z.'",
  },
  {
    id: "summary-recap",
    name: "Summary-recap endings",
    desc: "'In conclusion', 'Ultimately', or a final paragraph restating the piece. The reader was just there.",
  },
  {
    id: "em-dash",
    name: "Em-dash overuse",
    desc: "An em-dash habit makes every sentence hit the same beat. In AI copy, it is a default rhythm crutch.",
  },
  {
    id: "design-color",
    name: "Design: color tells",
    desc: "The default palette moves of generated UI: indigo-violet gradients, gradient-crushed text, glow halos.",
  },
  {
    id: "design-type",
    name: "Design: type tells",
    desc: "Typography moves that read as generated: serif-italic emphasis, kickers over every heading, flat hierarchies.",
  },
  {
    id: "design-copy",
    name: "Design: copy tells",
    desc: "UI copy habits: emoji everywhere, the 'it's not just X — it's Y' voice, 'say goodbye to' framing.",
  },
  {
    id: "design-component",
    name: "Design: component tells",
    desc: "Stock components of generated UI: glowing status dots, colored-left-border callouts, glassmorphism, badge spam.",
  },
  {
    id: "design-motion",
    name: "Design: motion tells",
    desc: "Motion defaults: springy scale-on-hover, wobbling spinners, transition-all everywhere.",
  },
  {
    id: "design-layout",
    name: "Design: layout tells",
    desc: "Layout defaults: invented stat rows, 01/02/03 section markers, cards inside cards, one gap everywhere.",
  },
];

const SLOP_PATTERNS = [
  // ------------------------------------------------------------------
  // word-ban — banned words (from no-ai-slop banned list + stop-slop
  // phrase list + kill-ai-slop copy voice)
  // ------------------------------------------------------------------
  { id: "w-delve", category: "word-ban", severity: 2, kind: "word", match: "delve", desc: "The archetypal AI verb for 'investigate'. If a model wrote it once a year ago, every model writes it now.", fix: "Use 'explore', 'examine', or simply 'look into' — or state what you actually did.", rewrite: "explore" },
  { id: "w-foster", category: "word-ban", severity: 2, kind: "word", match: "foster", desc: "'Foster' is the AI default for any positive social outcome.", fix: "Name the mechanism that creates the outcome.", rewrite: "build" },
  { id: "w-leverage", category: "word-ban", severity: 2, kind: "word", match: "leverage", desc: "'Leverage as a verb' is consultant-speak AI inherits.", fix: "Use 'use', 'build on', or 'take advantage of' with a concrete subject.", rewrite: "use" },
  { id: "w-utilize", category: "word-ban", severity: 2, kind: "word", match: "utilize", desc: "'Utilize' says nothing that 'use' doesn't, in more letters.", fix: "'Use'.", rewrite: "use" },
  { id: "w-facilitate", category: "word-ban", severity: 2, kind: "word", match: "facilitate", desc: "Abstract enabling language that hides who does what.", fix: "Say who helped whom do what, directly.", rewrite: "help" },
  { id: "w-empower", category: "word-ban", severity: 2, kind: "word", match: "empower", desc: "A slogan word that promises agency while erasing the person granting it.", fix: "Say what capability people actually get.", rewrite: "enable" },
  { id: "w-streamline", category: "word-ban", severity: 2, kind: "word", match: "streamline", desc: "Overused shorthand for 'make simpler' that rarely names the simplification.", fix: "Describe the specific simplification.", rewrite: "simplify" },
  { id: "w-robust", category: "word-ban", severity: 1, kind: "word", match: "robust", desc: "A grader's word that passes for an engineering claim without evidence.", fix: "Give the measurable property: handles N, recovers from X.", rewrite: "reliable" },
  { id: "w-cutting-edge", category: "word-ban", severity: 3, kind: "phrase", match: "cutting-edge", desc: "Claims novelty by fiat. AI adds it to anything vaguely technical.", fix: "State what is new about it, concretely.", rewrite: "current" },
  { id: "w-game-changer", category: "word-ban", severity: 3, kind: "phrase", match: "game-changer", desc: "The superlative AI attaches to ordinary features.", fix: "Show the before/after difference instead.", rewrite: "important" },
  { id: "w-tapestry", category: "word-ban", severity: 3, kind: "word", match: "tapestry", desc: "The metaphor models default to for richness at scale.", fix: "Describe the actual structure.", rewrite: "mix" },
  { id: "w-realm", category: "word-ban", severity: 2, kind: "word", match: "realm", desc: "'In the realm of' is padding that claims scope without content.", fix: "Name the domain directly.", rewrite: "world" },
  { id: "w-beacon", category: "word-ban", severity: 2, kind: "word", match: "beacon", desc: "Metaphor inflation: products are not lighthouses.", fix: "Say what the product actually leads toward.", rewrite: "example" },
  { id: "w-multifaceted", category: "word-ban", severity: 2, kind: "word", match: "multifaceted", desc: "A thesaurus word that means 'has several parts' and says nothing about them.", fix: "List the parts.", rewrite: "complex" },
  { id: "w-meticulous", category: "word-ban", severity: 1, kind: "word", match: "meticulous", desc: "Self-praise that substitutes for evidence of care.", fix: "Show the care in the work.", rewrite: "careful" },
  { id: "w-intricate", category: "word-ban", severity: 1, kind: "word", match: "intricate", desc: "Filler praise that says a thing is detailed without saying why it matters.", fix: "Describe how the detail works.", rewrite: "detailed" },
  { id: "w-paramount", category: "word-ban", severity: 2, kind: "word", match: "paramount", desc: "AI's most dramatic way of saying 'important'.", fix: "State the priority plainly.", rewrite: "essential" },
  { id: "w-transformative", category: "word-ban", severity: 3, kind: "word", match: "transformative", desc: "The strongest downloadable superlative, applied to everything.", fix: "Describe the transformation concretely.", rewrite: "far-reaching" },
  { id: "w-elevate", category: "word-ban", severity: 2, kind: "word", match: "elevate", desc: "'Elevate your X' is a reflexive AI promise of uplift.", fix: "State the improvement achieved.", rewrite: "improve" },
  { id: "w-embark", category: "word-ban", severity: 2, kind: "word", match: "embark", desc: "'Embark on a journey' — the journey metaphor rides on every AI post.", fix: "Say what starts.", rewrite: "start" },
  { id: "w-supercharge", category: "word-ban", severity: 3, kind: "word", match: "supercharge", desc: "The energy drink of AI copy: promises force without a mechanism.", fix: "Name the mechanism.", rewrite: "boost" },
  { id: "w-harness", category: "word-ban", severity: 2, kind: "word", match: "harness", desc: "'Harness the power of' is a model default for capability talk.", fix: "Say what the capability does.", rewrite: "use" },
  { id: "w-ever-evolving", category: "word-ban", severity: 3, kind: "phrase", match: "ever-evolving", desc: "A compound only a predictive model produces, and then keeps producing.", fix: "Delete it.", rewrite: "changing" },
  { id: "w-unlock", category: "word-ban", severity: 2, kind: "word", match: "unlock", desc: "'Unlock the power/full potential' — the lock-picking model default.", fix: "State what becomes possible.", rewrite: "enable" },
  { id: "w-seamless", category: "word-ban", severity: 2, kind: "word", match: "seamless", desc: "An experience claim with no seams shown. AI applies it to every integration.", fix: "Describe the workflow by what it removes.", rewrite: "smooth" },
  { id: "w-landscape", category: "word-ban", severity: 2, kind: "word", match: "landscape", desc: "'The X landscape' is AI's shape for any market context.", fix: "Name the field, market, or scene directly.", rewrite: "field" },
  { id: "w-journey", category: "word-ban", severity: 2, kind: "word", match: "journey", desc: "The universal metaphor for any process with steps, especially user onboarding.", fix: "Call it what it is: setup, adoption, process.", rewrite: "process" },
  { id: "w-dynamic", category: "word-ban", severity: 1, kind: "word", match: "dynamic", desc: "A filler adjective that claims energy without evidence.", fix: "Cut or be specific.", rewrite: "" },
  { id: "w-innovative", category: "word-ban", severity: 1, kind: "word", match: "innovative", desc: "Self-describing novelty; if it were innovative you could show it.", fix: "Show what's different.", rewrite: "new" },
  { id: "w-revolution", category: "word-ban", severity: 3, kind: "regex", match: "revolutioni[sz](e|ing|ed|es)", desc: "The strongest possible claim, applied to products that landed this week.", fix: "Describe the actual change in workflow.", rewrite: "transforms" },

  // ------------------------------------------------------------------
  // filler-phrases
  // ------------------------------------------------------------------
  { id: "f-fast-paced", category: "filler-phrases", severity: 3, kind: "phrase", match: "in today's fast-paced world", desc: "The AI paragraph's opening move since 2023.", fix: "Delete; start with the point.", rewrite: "today" },
  { id: "f-in-todays-world", category: "filler-phrases", severity: 3, kind: "phrase", match: "in today's world", desc: "'In today's world' backgrounds any claim in a vague now.", fix: "Delete; start with the point.", rewrite: "today" },
  { id: "f-age-of", category: "filler-phrases", severity: 2, kind: "phrase", match: "in the age of", desc: "Epoch-name inflation: whatever follows is seldom a whole age.", fix: "Delete or name the actual era.", rewrite: "" },
  { id: "f-world-of", category: "filler-phrases", severity: 2, kind: "phrase", match: "in the world of", desc: "'In the world of X' is a soft landing for a topic. Land harder.", fix: "Name the field directly.", rewrite: "" },
  { id: "f-its-worth-noting", category: "filler-phrases", severity: 2, kind: "phrase", match: "it's worth noting", desc: "A hedge that announces significance before delivering it.", fix: "Just deliver it.", rewrite: "note that" },
  { id: "f-important-to-note", category: "filler-phrases", severity: 2, kind: "phrase", match: "it's important to note", desc: "Requests attention instead of earning it.", fix: "State the fact; the reader will judge.", rewrite: "note that" },
  { id: "f-important-to-remember", category: "filler-phrases", severity: 2, kind: "phrase", match: "it's important to remember", desc: "A nagging parent of an opener.", fix: "State the fact.", rewrite: "remember" },
  { id: "f-end-of-day", category: "filler-phrases", severity: 2, kind: "phrase", match: "at the end of the day", desc: "A filler summary phrase that signals the actual conclusion.", fix: "Write the conclusion.", rewrite: "ultimately" },
  { id: "f-when-it-comes", category: "filler-phrases", severity: 2, kind: "phrase", match: "when it comes to", desc: "A locator phrase AI uses to arrive at a topic sideways.", fix: "Name the topic and get to it.", rewrite: "for" },
  { id: "f-at-its-core", category: "filler-phrases", severity: 2, kind: "phrase", match: "at its core", desc: "Announces an essence without delivering one.", fix: "Deliver the essence directly.", rewrite: "fundamentally" },
  { id: "f-reality-is", category: "filler-phrases", severity: 2, kind: "phrase", match: "the reality is", desc: "Presents the editor's opinion as shared reality.", fix: "State the fact or opinion plainly.", rewrite: "" },
  { id: "f-truth-is", category: "filler-phrases", severity: 2, kind: "phrase", match: "the truth is", desc: "Claims a monopoly on truth before the sentence.", fix: "State it.", rewrite: "" },
  { id: "f-in-terms-of", category: "filler-phrases", severity: 2, kind: "phrase", match: "in terms of", desc: "A wobble that defers the noun it should have been.", fix: "Rewrite to the direct noun.", rewrite: "" },
  { id: "f-with-regard", category: "filler-phrases", severity: 2, kind: "phrase", match: "with regard to", desc: "Biz-formal padding for 'about'.", fix: "Use 'about'.", rewrite: "about" },
  { id: "f-in-order-to", category: "filler-phrases", severity: 1, kind: "phrase", match: "in order to", desc: "Extra words for a plain 'to'.", fix: "Use 'to'.", rewrite: "to" },
  { id: "f-going-forward", category: "filler-phrases", severity: 2, kind: "phrase", match: "going forward", desc: "Calendar-speak that means 'from now on' — a rank AI/email tell.", fix: "Use 'from now on' or a date.", rewrite: "from now on" },
  { id: "f-lets-dive", category: "filler-phrases", severity: 2, kind: "phrase", match: "let's dive in", desc: "The AI open-the-body transition.", fix: "Start the next section; you don't need the handshake.", rewrite: "" },
  { id: "f-dive-into", category: "filler-phrases", severity: 2, kind: "phrase", match: "dive into", desc: "'We dive into' is the go-to for section announcements.", fix: "Write the section.", rewrite: "cover" },
  { id: "f-navigate", category: "filler-phrases", severity: 2, kind: "word", match: "navigate", desc: "'Navigate the complexities of' — a compass AI keeps pointing at the sea.", fix: "Use 'handle', 'address', 'deal with'.", rewrite: "handle" },
  { id: "f-turns-out", category: "filler-phrases", severity: 2, kind: "phrase", match: "it turns out", desc: "A reveal-maker that schedules the surprise it never delivers.", fix: "State the finding.", rewrite: "" },
  { id: "f-unpack", category: "filler-phrases", severity: 2, kind: "word", match: "unpack", desc: "Pretends analysis is a suitcase.", fix: "Explain, examine, walk through.", rewrite: "explain" },

  // ------------------------------------------------------------------
  // business-jargon
  // ------------------------------------------------------------------
  { id: "b-double-down", category: "business-jargon", severity: 2, kind: "phrase", match: "double down", desc: "A gambling metaphor for commitment that AI treats as a switch.", fix: "Commit more precisely: invest more, bet more, dedicate.", rewrite: "commit to" },
  { id: "b-deep-dive", category: "business-jargon", severity: 2, kind: "phrase", match: "deep dive", desc: "'Let's do a deep dive' — nobody dives, papers get read.", fix: "Analysis, review, examination.", rewrite: "analysis" },
  { id: "b-circle-back", category: "business-jargon", severity: 2, kind: "phrase", match: "circle back", desc: "Management-speak for 'talk later' that survives on pure ritual.", fix: "'Return to this' or 'I'll follow up'.", rewrite: "follow up" },
  { id: "b-moving-forward", category: "business-jargon", severity: 2, kind: "phrase", match: "moving forward", desc: "Corporate calendar-speak.", fix: "'Next' or 'from now on'.", rewrite: "next" },
  { id: "b-synergy", category: "business-jargon", severity: 3, kind: "word", match: "synergy", desc: "The all-time corporate buzzword; models resurrect it in AI panel text.", fix: "Describe the combined effect.", rewrite: "combined effect" },
  { id: "b-lean-in", category: "business-jargon", severity: 2, kind: "phrase", match: "lean into", desc: "Poses posture as policy.", fix: "Accept, embrace, focus on.", rewrite: "embrace" },
  { id: "b-paradigm-shift", category: "business-jargon", severity: 3, kind: "phrase", match: "paradigm shift", desc: "The grandest claim in software, applied to every changelog.", fix: "State what model changed and why it matters.", rewrite: "" },
  { id: "b-best-in-class", category: "business-jargon", severity: 3, kind: "phrase", match: "best-in-class", desc: "Trophy-speak with no benchmark attached.", fix: "Name the comparison.", rewrite: "" },
  { id: "b-world-class", category: "business-jargon", severity: 3, kind: "phrase", match: "world-class", desc: "A flat claim of rank with no ranked list.", fix: "Show the evidence of rank.", rewrite: "" },
  { id: "b-state-of-the-art", category: "business-jargon", severity: 2, kind: "phrase", match: "state-of-the-art", desc: "Claims frontier status by phrase rather than by measurement.", fix: "State the actual technical baseline.", rewrite: "current" },
  { id: "b-next-level", category: "business-jargon", severity: 3, kind: "phrase", match: "next-level", desc: "The default superlative of AI copy.", fix: "Describe the level.", rewrite: "" },
  { id: "b-touch-base", category: "business-jargon", severity: 2, kind: "phrase", match: "touch base", desc: "Corp-speak for 'talk'.", fix: "'Let's talk', 'let me check in'.", rewrite: "check in" },
  { id: "b-mission-critical", category: "business-jargon", severity: 2, kind: "phrase", match: "mission-critical", desc: "Makes every feature a missile.", fix: "Say what breaks when it fails.", rewrite: "" },
  { id: "b-low-hanging", category: "business-jargon", severity: 2, kind: "phrase", match: "low-hanging fruit", desc: "A fruit metaphor for easy wins; models pick it daily.", fix: "'Quick wins'.", rewrite: "quick wins" },

  // ------------------------------------------------------------------
  // throat-clearing
  // ------------------------------------------------------------------
  { id: "t-heres-the-thing", category: "throat-clearing", severity: 2, kind: "phrase", match: "here's the thing", desc: "The famous opener that puts the point behind a door.", fix: "Cut it and state the point.", rewrite: "" },
  { id: "t-heres-what", category: "throat-clearing", severity: 2, kind: "phrase", match: "here's what", desc: "'Here's what I found/mean/think' — the announcement of an announcement.", fix: "Deliver the content.", rewrite: "" },
  { id: "t-let-me-be-clear", category: "throat-clearing", severity: 2, kind: "phrase", match: "let me be clear", desc: "Solemn pre-announcement with no content of its own.", fix: "Be clear now.", rewrite: "" },
  { id: "t-ill-be-honest", category: "throat-clearing", severity: 2, kind: "phrase", match: "i'll be honest", desc: "Pre-announces honesty; honesty should arrive without a handshake.", fix: "Be honest now.", rewrite: "" },
  { id: "t-uncomfortable-truth", category: "throat-clearing", severity: 3, kind: "phrase", match: "the uncomfortable truth is", desc: "The AI way to smuggle in an opinion with a pre-rolled wince.", fix: "State the truth plainly.", rewrite: "" },
  { id: "t-let-me-walk", category: "throat-clearing", severity: 2, kind: "phrase", match: "let me walk you through", desc: "A tour-guide announcement for content that follows.", fix: "Write the walkthrough.", rewrite: "" },
  { id: "t-i-want-to-explore", category: "throat-clearing", severity: 2, kind: "phrase", match: "i want to explore", desc: "Declares curiosity instead of doing the exploration.", fix: "Write the exploration.", rewrite: "" },
  { id: "t-as-we-see", category: "throat-clearing", severity: 2, kind: "phrase", match: "as we'll see", desc: "Promises forward drama.", fix: "Delete it.", rewrite: "" },
  { id: "t-in-this-article", category: "throat-clearing", severity: 2, kind: "phrase", match: "in this article", desc: "Metacommentary about the article inside the article.", fix: "Delete; the reader knows where they are.", rewrite: "" },
  { id: "t-here-are-the-things", category: "throat-clearing", severity: 1, kind: "phrase", match: "here are the", desc: "List announcement that AI uses to introduce bullet rails.", fix: "Just start the list.", rewrite: "" },

  // ------------------------------------------------------------------
  // faux-insight
  // ------------------------------------------------------------------
  { id: "i-nobody-tells", category: "faux-insight", severity: 3, kind: "phrase", match: "what nobody tells you", desc: "Claims exclusive knowledge by insulting everyone else's writing.", fix: "Make the claim; skip the exclusivity.", rewrite: "" },
  { id: "i-no-one-tells", category: "faux-insight", severity: 3, kind: "phrase", match: "what no one tells you", desc: "Sibling of 'what nobody tells you'.", fix: "Make the claim.", rewrite: "" },
  { id: "i-most-get-wrong", category: "faux-insight", severity: 3, kind: "phrase", match: "what most people get wrong", desc: "Positions the reader as wrong before they've read.", fix: "State the correct idea plainly.", rewrite: "" },
  { id: "i-everyone-misses", category: "faux-insight", severity: 3, kind: "phrase", match: "the part everyone misses", desc: "Flatters the writer as the one who saw the part.", fix: "State the part.", rewrite: "" },
  { id: "i-nobody-talks", category: "faux-insight", severity: 2, kind: "phrase", match: "nobody talks about", desc: "Claims a taboo that may not exist.", fix: "Name the subject.", rewrite: "" },
  { id: "i-most-people-dont", category: "faux-insight", severity: 2, kind: "phrase", match: "most people don't know", desc: "Insider-posture opener.", fix: "State the fact.", rewrite: "" },
  { id: "i-secret-to", category: "faux-insight", severity: 2, kind: "phrase", match: "the secret to", desc: "There is no secret; there is a method.", fix: "Describe the method.", rewrite: "" },

  // ------------------------------------------------------------------
  // binary-contrast (regex — original patterns, no lookbehind)
  // ------------------------------------------------------------------
  { id: "bc-not-but", category: "binary-contrast", severity: 2, kind: "regex", match: "\\bnot (just )?[a-z][^.!?]{2,40}?\\.\\s*(it'?s|it is|this is|that is) [a-z]", desc: "The 'not X — it's Y' reversal, the most famous AI-rhythm tell.", fix: "State Y directly and drop the negation runway.", rewrite: "" },
  { id: "bc-isnt-it-is", category: "binary-contrast", severity: 2, kind: "regex", match: "\\b(?:isn'?t|is not|wasn'?t|was not) [a-z][^.!?]{2,40}?\\.\\s*(?:it'?s|it is|it was|this is|the .{1,20} was|the .{1,20} is) ", desc: "The negation-then-assertion crutch.", fix: "State the second half as a plain positive sentence.", rewrite: "" },
  { id: "bc-the-question", category: "binary-contrast", severity: 2, kind: "regex", match: "the question (?:isn'?t|is not) [^.!?]{2,40}?\\.\\s*it'?s ", desc: "Rhetorical misdirection: pose a question only to flip it.", fix: "Answer the real question directly.", rewrite: "" },

  // ------------------------------------------------------------------
  // colon-reveal
  // ------------------------------------------------------------------
  { id: "cr-noun-colon", category: "colon-reveal", severity: 1, kind: "regex", match: "\\b(the|a) (best part|kicker|catch|twist|secret|detail|real winner|bottom line): [a-z]", desc: "A dramatic colon constructing a reveal that lowercase letters undercut.", fix: "Plain sentence; colons for lists and labels.", rewrite: "" },

  // ------------------------------------------------------------------
  // importance-puffery
  // ------------------------------------------------------------------
  { id: "p-testament", category: "importance-puffery", severity: 3, kind: "phrase", match: "stands as a testament", desc: "Declares lasting significance in a press-release voice.", fix: "Show the fact.", rewrite: "" },
  { id: "p-pivotal", category: "importance-puffery", severity: 3, kind: "phrase", match: "marks a pivotal moment", desc: "Dates the epoch mid-changelog.", fix: "State what changed.", rewrite: "" },
  { id: "p-vital-role", category: "importance-puffery", severity: 2, kind: "phrase", match: "plays a vital role", desc: "'Plays a role' with an adjective — the model's importance default.", fix: "Name the role's effect.", rewrite: "" },
  { id: "p-underscores", category: "importance-puffery", severity: 2, kind: "phrase", match: "underscores", desc: "A verb that claims to underline significance no one asked about.", fix: "Cut; state the significance itself.", rewrite: "" },
  { id: "p-solidifies", category: "importance-puffery", severity: 2, kind: "phrase", match: "solidifies its position", desc: "Positioning-speak with no position shown.", fix: "Describe what changed.", rewrite: "" },
  { id: "p-changes-everything", category: "importance-puffery", severity: 3, kind: "phrase", match: "this changes everything", desc: "The grandest claim, almost always hyperbole.", fix: "Describe the actual effect.", rewrite: "" },
  { id: "p-keystone", category: "importance-puffery", severity: 2, kind: "phrase", match: "a cornerstone of", desc: "Architecture metaphors for importance.", fix: "Name the dependency.", rewrite: "" },

  // ------------------------------------------------------------------
  // weasel-attribution
  // ------------------------------------------------------------------
  { id: "wz-experts", category: "weasel-attribution", severity: 3, kind: "phrase", match: "experts agree", desc: "An invisible college that agrees whenever asked.", fix: "Name an expert or drop the claim.", rewrite: "" },
  { id: "wz-studies-show", category: "weasel-attribution", severity: 3, kind: "phrase", match: "studies show", desc: "Unverifiable citation by plural.", fix: "Cite a specific study or drop it.", rewrite: "" },
  { id: "wz-research-shows", category: "weasel-attribution", severity: 3, kind: "phrase", match: "research shows", desc: "Researcher-shaped authority with no paper attached.", fix: "Cite it.", rewrite: "" },
  { id: "wz-many-argue", category: "weasel-attribution", severity: 2, kind: "phrase", match: "many argue", desc: "A crowd that argues on demand.", fix: "Name the camp.", rewrite: "" },
  { id: "wz-widely-regarded", category: "weasel-attribution", severity: 2, kind: "phrase", match: "widely regarded", desc: "An approval poll nobody took.", fix: "Name the regarder.", rewrite: "" },
  { id: "wz-industry-reports", category: "weasel-attribution", severity: 2, kind: "phrase", match: "industry reports", desc: "The industry is not a reporter.", fix: "Name the report.", rewrite: "" },
  { id: "wz-some-say", category: "weasel-attribution", severity: 2, kind: "phrase", match: "some say", desc: "Whispered authority.", fix: "Name a source.", rewrite: "" },

  // ------------------------------------------------------------------
  // fake-strong-verb
  // ------------------------------------------------------------------
  { id: "fv-made-decision", category: "fake-strong-verb", severity: 2, kind: "phrase", match: "made a decision", desc: "A noun-heavy wrapper for 'decided'.", fix: "'Decided'.", rewrite: "decided" },
  { id: "fv-has-ability", category: "fake-strong-verb", severity: 2, kind: "phrase", match: "has the ability to", desc: "Five words for 'can'.", fix: "'Can'.", rewrite: "can" },
  { id: "fv-serves-as", category: "fake-strong-verb", severity: 2, kind: "phrase", match: "serves as a", desc: "A bureaucratic stand-in for 'is' or the actual verb.", fix: "Name what it does.", rewrite: "" },
  { id: "fv-centralized-hub", category: "fake-strong-verb", severity: 2, kind: "phrase", match: "centralized hub", desc: "The AI way to describe a feature that stores stuff.", fix: "Say what it tracks and where.", rewrite: "" },
  { id: "fv-enhance", category: "fake-strong-verb", severity: 1, kind: "word", match: "enhance", desc: "Vague improvement that models use as a default verb.", fix: "Describe the improvement.", rewrite: "improve" },
  { id: "fv-elevate-exp", category: "fake-strong-verb", severity: 1, kind: "phrase", match: "elevate the", desc: "'Elevate the experience' — an X that goes up.", fix: "Describe the experience change.", rewrite: "" },

  // ------------------------------------------------------------------
  // adverb-overuse (often-empty)
  // ------------------------------------------------------------------
  { id: "a-really", category: "adverb-overuse", severity: 1, kind: "word", match: "really", desc: "Intensifier that usually adds nothing.", fix: "Cut it; keep only for real emphasis.", rewrite: "" },
  { id: "a-just", category: "adverb-overuse", severity: 1, kind: "word", match: "just", desc: "A filler that sneaks into every AI draft.", fix: "Cut when empty; keep when it means 'only' or 'recently'.", rewrite: "" },
  { id: "a-literally", category: "adverb-overuse", severity: 2, kind: "word", match: "literally", desc: "Usually not literally.", fix: "Cut, or keep only for actual literalness.", rewrite: "" },
  { id: "a-genuinely", category: "adverb-overuse", severity: 1, kind: "word", match: "genuinely", desc: "An authenticity claim in an adverb.", fix: "Delete it.", rewrite: "" },
  { id: "a-honestly", category: "adverb-overuse", severity: 1, kind: "word", match: "honestly", desc: "Faith in a word instead of in content.", fix: "Cut unless it is the point (rare).", rewrite: "" },
  { id: "a-simply", category: "adverb-overuse", severity: 1, kind: "word", match: "simply", desc: "Complex things are not simply done.", fix: "Delete it.", rewrite: "" },
  { id: "a-actually", category: "adverb-overuse", severity: 1, kind: "word", match: "actually", desc: "Contrast padding.", fix: "Cut when empty, keep for true contrast.", rewrite: "" },
  { id: "a-truly", category: "adverb-overuse", severity: 1, kind: "word", match: "truly", desc: "Emphasis by assertion.", fix: "Delete it.", rewrite: "" },
  { id: "a-fundamentally", category: "adverb-overuse", severity: 1, kind: "word", match: "fundamentally", desc: "Scheherazade of adverbs: says big, delivers little.", fix: "Delete it.", rewrite: "" },
  { id: "a-importantly", category: "adverb-overuse", severity: 1, kind: "word", match: "importantly", desc: "Tells you what to weight before giving it.", fix: "Cut; put the important thing first.", rewrite: "" },
  { id: "a-crucially", category: "adverb-overuse", severity: 1, kind: "word", match: "crucially", desc: "The heavy version of 'importantly'.", fix: "Delete it.", rewrite: "" },
  { id: "a-inherently", category: "adverb-overuse", severity: 1, kind: "word", match: "inherently", desc: "Presents a judgment as a property of nature.", fix: "Cut; argue the point instead.", rewrite: "" },
  { id: "a-inevitably", category: "adverb-overuse", severity: 1, kind: "word", match: "inevitably", desc: "Presents outcomes as fated.", fix: "Show the mechanism.", rewrite: "" },
  { id: "a-arguably", category: "adverb-overuse", severity: 1, kind: "word", match: "arguably", desc: "A hedge in formal clothes.", fix: "Cut, or say who argues it.", rewrite: "" },
  { id: "a-interestingly", category: "adverb-overuse", severity: 1, kind: "word", match: "interestingly", desc: "Announces the interest that the content must create.", fix: "Delete it.", rewrite: "" },

  // ------------------------------------------------------------------
  // rhetorical-setup
  // ------------------------------------------------------------------
  { id: "r-what-if", category: "rhetorical-setup", severity: 2, kind: "phrase", match: "what if i told you", desc: "The Socratic posture of street-corner puzzles.", fix: "State it.", rewrite: "" },
  { id: "r-think-about-it", category: "rhetorical-setup", severity: 2, kind: "phrase", match: "think about it", desc: "A condescending prompt to reflect.", fix: "Delete it.", rewrite: "" },
  { id: "r-plot-twist", category: "rhetorical-setup", severity: 2, kind: "phrase", match: "plot twist", desc: "Narrative-theater labeling.", fix: "Delete it.", rewrite: "" },
  { id: "r-here-what-i-mean", category: "rhetorical-setup", severity: 2, kind: "phrase", match: "here's what i mean", desc: "A preview that schedules an explanation.", fix: "Explain now.", rewrite: "" },

  // ------------------------------------------------------------------
  // negative-listing
  // ------------------------------------------------------------------
  { id: "nl-not-a", category: "negative-listing", severity: 2, kind: "regex", match: "not (?:a|an) [^.!?]{2,40}\\.\\s*not (?:a|an) [^.!?]{2,40}\\.", desc: "The 'not a X. Not a Y. A Z.' buildup.", fix: "State Z directly; no runway.", rewrite: "" },
  { id: "nl-it-wasnt", category: "negative-listing", severity: 2, kind: "regex", match: "it (?:wasn'?t|was not) [^.!?]{2,40}\\.\\s*it (?:wasn'?t|was not) ", desc: "The past-tense negative-listing pair.", fix: "State what it was.", rewrite: "" },

  // ------------------------------------------------------------------
  // dramatic-fragment
  // ------------------------------------------------------------------
  { id: "df-thats-it", category: "dramatic-fragment", severity: 2, kind: "regex", match: "that'?s it\\.\\s*that'?s\\s*the ", desc: "The performative-simplicity mic drop.", fix: "Rewrite as a complete statement.", rewrite: "" },
  { id: "df-and-and", category: "dramatic-fragment", severity: 2, kind: "regex", match: "\\.\\s*and [A-Z][a-z]{2,15}\\.\\s*and [A-Z]", desc: "The staccato 'X. And Y. And Z.' stack.", fix: "Join into complete sentences.", rewrite: "" },
  { id: "df-everything-is", category: "dramatic-fragment", severity: 2, kind: "regex", match: "^[A-Z][a-z]{2,20}\\.\\s+(?:That|This|It)'?s (?:the|a) ", desc: "A lone fragment announcing a thing, followed by a claim.", fix: "Complete the sentence.", rewrite: "" },

  // ------------------------------------------------------------------
  // summary-recap
  // ------------------------------------------------------------------
  { id: "s-in-conclusion", category: "summary-recap", severity: 2, kind: "phrase", match: "in conclusion", desc: "The formal sign-off for a restatement.", fix: "Delete; end on the last concrete point.", rewrite: "" },
  { id: "s-ultimately", category: "summary-recap", severity: 1, kind: "word", match: "ultimately", desc: "A smooth word into a recap.", fix: "Cut when it leads a recap.", rewrite: "" },
  { id: "s-to-sum-up", category: "summary-recap", severity: 2, kind: "phrase", match: "to sum up", desc: "Restates the article inside the article.", fix: "Delete it.", rewrite: "" },
  { id: "s-all-in-all", category: "summary-recap", severity: 1, kind: "phrase", match: "all in all", desc: "A wrap-up coin.", fix: "Delete it.", rewrite: "" },

  // ------------------------------------------------------------------
  // em-dash
  // ------------------------------------------------------------------
  { id: "e-em-dash", category: "em-dash", severity: 1, kind: "regex", match: "[\\u2014\\u2012\\u2013]\\s*[\\u2014\\u2012\\u2013]", desc: "A cluster of dashes is the AI sentence-fragment factory: every clause hits one beat.", fix: "Use commas or periods; let sentences vary.", rewrite: ", " },

  // ------------------------------------------------------------------
  // design-color — machine-checkable over HTML/CSS
  // ------------------------------------------------------------------
  { id: "d-indigo-violet-gradient", category: "design-color", severity: 3, kind: "regex", match: "(from-(?:indigo|violet|purple|fuchsia)-[0-9]{2,4}\\s+to-(?:purple|violet|fuchsia|pink)-[0-9]{2,4}|linear-gradient\\([^;]*#(?:6366f1|8b5cf6|a855f7|7c3aed))", desc: "The factory-default #6366f1 → #a855f7 diagonal gradient on buttons and heroes.", fix: "One justified accent; if a gradient, give it direction and a reason.", rewrite: "" },
  { id: "d-gradient-text", category: "design-color", severity: 2, kind: "regex", match: "(bg-clip-text\\s+text-transparent|-webkit-background-clip:\\s*text|background-clip:\\s*text)", desc: "Gradient-crushed headline text: decoration eating the message.", fix: "Solid color; build hierarchy with size and weight.", rewrite: "" },
  { id: "d-purple-glow", category: "design-color", severity: 2, kind: "regex", match: "(shadow-(?:indigo|violet|purple)-[0-9]+\\/[0-9]+|box-shadow:[^;]*(#6366f1|#8b5cf6|#a855f7))", desc: "Colored glow shadows used as fake dark-mode accents.", fix: "Keep shadows colorless; a tinted glow is not depth.", rewrite: "" },
  { id: "d-atmosphere-gradient", category: "design-color", severity: 2, kind: "regex", match: "(radial-gradient\\s*\\(|bg-\\[radial-gradient|repeating-(?:linear|radial)-gradient)", desc: "Page-wide radial glow or repeating striped gradients used as atmosphere.", fix: "One flat background; depth from hairlines and restrained shadows.", rewrite: "" },

  // ------------------------------------------------------------------
  // design-type
  // ------------------------------------------------------------------
  { id: "d-serif-italic", category: "design-type", severity: 3, kind: "regex", match: "(font-serif[^\"']*font-style:\\s*italic|italic;?[^\"']*font-family:\\s*[^\"']*(playfair|lora|cormorant))", desc: "One word swapped to serif italic for 'emphasis' inside a sans headline.", fix: "Emphasize with weight, position, or line break; keep one voice.", rewrite: "" },
  { id: "d-serif-font", category: "design-type", severity: 2, kind: "regex", match: "(font-family:\\s*[^;{}]*(playfair|cormorant|lora|fantasy)[^;{}]*;)", desc: "Display serif (Playfair/Lora/Cormorant) used as UI or hero-face by default.", fix: "One legible sans you chose; serif only when the voice needs it.", rewrite: "" },
  { id: "d-kicker", category: "design-type", severity: 2, kind: "regex", match: "(uppercase\\s*[^\"']*tracking-(?:wide|wider|widest)|tracking-(?:wide|wider|widest)[^\"']*uppercase|text-transform:\\s*uppercase[^}]{0,80}letter-spacing:\\s*0?[.][0-9]+em)", desc: "The tracked-caps micro-label above every heading, restating the heading.", fix: "Delete kickers that restate headings; let scale introduce sections.", rewrite: "" },
  { id: "d-flat-type", category: "design-type", severity: 2, kind: "regex", match: "<h[12][^>]*class=\"[^\"]*text-(sm|base|lg)", desc: "Headings barely bigger than body — a flat type hierarchy.", fix: "A scale with real contrast (1.25x and up) between sizes.", rewrite: "" },
  { id: "d-inter-font", category: "design-type", severity: 1, kind: "regex", match: "(fonts\\.googleapis\\.com/css2\\?family=(Inter|Space\\+Grotesk|Manrope|Plus\\+Jakarta)|font-family\\s*:[^;}]*[\"']?(Inter|Space Grotesk|Manrope)[\"']?)", desc: "The same five default faces every generated page draws from.", fix: "Choose a face like a logo; be able to say why this one.", rewrite: "" },

  // ------------------------------------------------------------------
  // design-copy
  // ------------------------------------------------------------------
  { id: "d-not-just", category: "design-copy", severity: 2, kind: "regex", match: "not just [^.!?]{2,50}?\\.?\\s*[\\u2014-]{1,2}\\s*it'?s", desc: "The AI copywriting voice: 'It's not just X — it's Y.'", fix: "Write something specific with real nouns, numbers, consequences.", rewrite: "" },
  { id: "d-say-goodbye", category: "design-copy", severity: 2, kind: "phrase", match: "say goodbye to", desc: "The farewell framing every generated landing page uses.", fix: "State what the product does plainly.", rewrite: "" },
  { id: "d-meet-your-new", category: "design-copy", severity: 2, kind: "phrase", match: "meet your new", desc: "The greeting-card intro to a feature.", fix: "State what it does.", rewrite: "" },
  { id: "d-supercharge", category: "design-copy", severity: 2, kind: "phrase", match: "supercharge your", desc: "The energy drink copy default.", fix: "Name the mechanism.", rewrite: "" },
  { id: "d-effortless", category: "design-copy", severity: 2, kind: "word", match: "effortless", desc: "Promises frictionless experience without showing how.", fix: "Describe the flow.", rewrite: "" },
  { id: "d-unlock-the-power", category: "design-copy", severity: 2, kind: "phrase", match: "unlock the power", desc: "Key-turning copy for capability claims.", fix: "State what becomes possible.", rewrite: "" },
  { id: "d-emoji-everywhere", category: "design-copy", severity: 2, kind: "regex", flags: "gu", match: "(<h[1-6][^>]*>[^<]{0,40}[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]|<button[^>]*>[^<]{0,40}[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF])", desc: "An emoji on every heading and button, borrowed warmth.", fix: "Cut decorative emoji; keep one only where it carries real status.", rewrite: "" },

  // ------------------------------------------------------------------
  // design-component
  // ------------------------------------------------------------------
  { id: "d-glowing-dot", category: "design-component", severity: 2, kind: "regex", match: "animate-ping|shadow-(?:green|emerald)-[0-9]+\\/[0-9]+", desc: "A status dot with a pulsing halo — usually saturated green.", fix: "A small flat dot plus a word; no halo, no pulse.", rewrite: "" },
  { id: "d-border-left-callout", category: "design-component", severity: 2, kind: "regex", match: "border-l-4\\s+rounded|border-left:\\s*4px", desc: "Every row wearing a colored left bar so none reads as an 'important note'.", fix: "Let a list be a list; callouts are scarce, one or two a page.", rewrite: "" },
  { id: "d-icon-tiles", category: "design-component", severity: 2, kind: "regex", match: "(rounded-(?:lg|xl|2xl)\\s+bg-(?:indigo|purple|blue|green|amber|pink)-(?:50|100))", desc: "Rounded-square chips + line icons tiled in a grid as the shortest route to 'designed'.", fix: "An icon must carry meaning or go.", rewrite: "" },
  { id: "d-glassmorphism", category: "design-component", severity: 2, kind: "regex", match: "backdrop-blur|backdrop-filter:\\s*blur", desc: "Translucent blur panes as the default card surface.", fix: "One small radius; depth from solid surfaces and space, not blur.", rewrite: "" },
  { id: "d-max-radius", category: "design-component", severity: 2, kind: "regex", match: "rounded-(?:full|\\[?9999px)|border-radius:\\s*(?:9999px|50%)", desc: "Max-radius pills on cards and inputs — a 2021 Dribbble freeze.", fix: "One radius held site-wide (usually small).", rewrite: "" },
  { id: "d-badge-spam", category: "design-component", severity: 2, kind: "regex", match: "(?:✨|\\u2728|beta|coming soon|hot|popular)[^<]{0,30}rounded-full|rounded-full[^>]*>[^<]*(beta|new|hot|popular)", desc: "Decorative status pills manufacturing fake buzz.", fix: "A badge only for real status — a version, a stock.", rewrite: "" },
  { id: "d-oversized-shadow", category: "design-component", severity: 2, kind: "regex", match: "shadow-(?:2xl|xl)(?![a-z])|box-shadow:[^;}]*\\b(60|70|80|90|100|120)px", desc: "A small card casting a huge soft shadow that tracks no real height.", fix: "A small elevation scale: tight blur, small offset, low opacity.", rewrite: "" },
  { id: "d-icon-tint", category: "design-component", severity: 2, kind: "regex", match: "bg-(?:indigo|blue|green|amber|red|purple|pink)-[0-9]+\\/[0-9]+\\s+text-(?:indigo|blue|green|amber|red|purple|pink)-", desc: "An icon wrapped in a see-through tint of its own color.", fix: "An icon inherits text color, no colored container.", rewrite: "" },
  { id: "d-bordered-ring", category: "design-component", severity: 1, kind: "regex", match: "border-2\\s+border-(?:indigo|purple|violet|blue|pink|green)-[0-9]+", desc: "A thick accent ring around a rounded card to make one tier 'pop'.", fix: "Carry the emphasis another way; let borders be hairlines.", rewrite: "" },
  { id: "d-avatar-grid", category: "design-component", severity: 2, kind: "regex", match: "(avatar|faces|team-grid|testimonial-grid)[^\"']{0,40}(grid|row)", desc: "The generic avatar grid standing in for social proof.", fix: "Real named people with real roles, or none.", rewrite: "" },
  { id: "d-powered-by-ai", category: "design-component", severity: 2, kind: "regex", match: "powered by (ai|gpt|anthropic|claude|openai|llm)\\b", desc: "The 'powered by AI' badge — a tech-laundry label with no user benefit attached.", fix: "Say what the feature does for the user, not which model powers it.", rewrite: "" },

  // ------------------------------------------------------------------
  // design-motion
  // ------------------------------------------------------------------
  { id: "d-springy-hover", category: "design-motion", severity: 2, kind: "regex", match: "hover:(?:scale-1(?:0[5-9]|1[0-9])|\\-?translate-y-[0-9]+)\\b|transition-all\\b|transition:\\s*all\\b", desc: "Cards that grow and bounce on hover; transition-all animating everything.", fix: "Transition only the properties that carry the state change, 120-200ms.", rewrite: "" },
  { id: "d-wobble-spinner", category: "design-motion", severity: 2, kind: "regex", match: "translate\\(-50%, ?-50%\\)[\\s\\S]{0,200}@keyframes", desc: "A spinner whose rotation center is clobbered by a translate — it wobbles.", fix: "Centre the artwork in its own box; keep centering out of the animated transform.", rewrite: "" },

  // ------------------------------------------------------------------
  // design-layout
  // ------------------------------------------------------------------
  { id: "d-stat-row", category: "design-layout", severity: 3, kind: "regex", match: "\\b(?:10k|50k|100k|1m|99\\.9|24\\/7|100x)\\b[^<]{0,60}(?:users|developers|uptime|support|faster|growth)", desc: "The invented stat row: round numbers with no measurement behind them.", fix: "Show a number only if you measured it, and say where it came from.", rewrite: "" },
  { id: "d-section-numbers", category: "design-layout", severity: 2, kind: "regex", match: ">\\s*0[1-9]\\b[^<]{0,40}<", desc: "Giant faint ordinals stapled to unordered marketing sections.", fix: "Number only genuinely ordered sequences — install steps, changelogs.", rewrite: "" },
  { id: "d-cards-in-cards", category: "design-layout", severity: 2, kind: "regex", match: "(class=\"[^\"]*card[^\"]*\"[\\s\\S]{0,300}class=\"[^\"]*card[^\"]*\"[\\s\\S]{0,300}class=\"[^\"]*card)", desc: "A card holding a card holding a card — every layer with its own surface.", fix: "One surface per region; group inside with spacing and hairlines.", rewrite: "" },
  { id: "d-caps-card-grid", category: "design-layout", severity: 2, kind: "regex", match: "text-transform:\\s*uppercase[^;}]{0,80}letter-spacing|uppercase[\\s\\S]{0,60}tracking-(?:wide|wider)|grid-cols-3[^>]{0,200}>", desc: "ALL-CAPS micro-labels producing interchangeable cards.", fix: "Show the most important thing fully; hierarchy over grid uniformity.", rewrite: "" },
  { id: "d-one-gap", category: "design-layout", severity: 1, kind: "regex", match: "(?:space-y-4|gap-4)(?:[^>]{0,60}?){0,3}(?:space-y-4|gap-4)", desc: "One spacing value stamped everywhere — nothing belongs to anything.", fix: "Space by relationship: tight inside groups, generous between.", rewrite: "" },
  { id: "d-bento", category: "design-layout", severity: 1, kind: "regex", match: "\\bbento\\b", desc: "The bento-grid as the default section shape.", fix: "Choose a section shape from the job, not the template.", rewrite: "" },
];

// ---------------------------------------------------------------------
// Derived helpers (kept as plain functions so data stays serializable)
// ---------------------------------------------------------------------

const CATEGORY_BY_ID = Object.fromEntries(PATTERN_CATEGORIES.map((c) => [c.id, c]));

function patternToRegExp(pattern) {
  const flags = pattern.flags || "gi";
  // kind "word": escaped literal with word boundaries, case-insensitive
  if (pattern.kind === "word") {
    const esc = pattern.match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${esc}\\b`, flags);
  }
  if (pattern.kind === "phrase") {
    // literal substring, case-insensitive; already escaped-free by author
    return new RegExp(pattern.match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  }
  // kind "regex": author-supplied source
  return new RegExp(pattern.match, flags);
}

return {
    version: "1.0.0",
    categories: PATTERN_CATEGORIES,
    patterns: SLOP_PATTERNS,
    categoryById: CATEGORY_BY_ID,
    patternToRegExp,
  };
});