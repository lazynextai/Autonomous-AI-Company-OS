"use strict";
/**
 * Lazynext AI Slop Checker — Spanish sample rules (data/rules.es.js).
 *
 * An ORIGINAL, Lazynext-written sample of Spanish AI-slop tells, shipped on
 * the same external-rules extension path as data/rules.ru.js and
 * data/rules.hi.js. Consumed with
 *
 *   node api/cli.js --rules data/rules.es.js "En un mundo cada vez más..."
 *
 * Spanish model-generated copy leans on its own dialect of the same tells:
 * anglicized business words ("apalancar", "optimizar", "seamless"),
 * epoch openers ("en el mundo actual", "en un mundo cada vez más"),
 * throat-clearing ("es importante destacar", "no es ningún secreto que"),
 * hedges ("en cierto modo", "podríamos decir que"), and generic
 * superlatives ("innovador", "revolucionario", "vanguardia"). Every
 * description and fix was written by Lazynext from knowledge of Spanish
 * copy conventions, not copied from any source repository.
 *
 * Pattern format matches data/slop-patterns.js. Categories reuse the base
 * ids where the tell belongs (filler-phrases, word-ban, throat-clearing,
 * summary-recap, weasel-attribution, business-jargon) and APPEND one new
 * category (es-copy-tics) per the "new categories appended" merge rule.
 *
 * Spanish uses \b only for ASCII-safe fragments; accented single-word tells
 * use kind "regex" with Unicode-aware boundaries and the "u" flag.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopPatternsEs = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {

const CATEGORIES = [
  {
    id: "es-copy-tics",
    name: "Spanish copy tics",
    desc: "The factory vocabulary of Spanish AI-generated copy: anglicisms and assurance words that pad a claim instead of making it.",
  },
];

const PATTERNS = [
  // ------------------------------------------------------------------
  // filler-phrases — epoch openers, Spanish edition
  // ------------------------------------------------------------------
  { id: "es-f-mundo-actual", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "en el mundo actual", desc: "'En el mundo actual' — the epoch-inflation opener; whichever topic follows is never actually a world.", fix: "Empieza por el hecho concreto, sin el preámbulo de 'mundo'.", rewrite: "" },
  { id: "es-f-mundo-cada-vez", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "en un mundo cada vez más", desc: "'En un mundo cada vez más rápido/cambiante' — the fast-changing-world preamble in Spanish.", fix: "Nombra el cambio concreto al que te refieres.", rewrite: "" },
  { id: "es-f-cabe-destacar", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "(?:es|hay que) (?:importante |preciso )?destacar(?: que)?", desc: "'Es importante destacar que…' — announces significance before delivering it.", fix: "Dí el hecho; el lector valorará por sí mismo.", rewrite: "" },
  { id: "es-f-cabe-mencionar", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "cabe mencionar", desc: "'Cabe mencionar que…' — the Spanish 'it's worth mentioning' throat-clearer.", fix: "Menciona directamente.", rewrite: "" },
  { id: "es-f-no-es-secreto", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "no es ningún secreto que", desc: "'No es ningún secreto que' — claims a shared truth before stating it.", fix: "Formula el hecho.", rewrite: "" },
  { id: "es-f-claramente", category: "filler-phrases", severity: 1, kind: "regex", flags: "giu", match: "claramente", desc: "'Claramente…' — an adverb that performs clarity instead of providing it.", fix: "Haz que la claridad esté en el contenido.", rewrite: "" },

  // ------------------------------------------------------------------
  // word-ban — anglicisms + generic superlatives (Unicode-aware)
  // ------------------------------------------------------------------
  { id: "es-w-apalancar", category: "word-ban", severity: 3, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])apalancar(?![\\p{L}\\p{N}])", desc: "'Apalancar' — the calque of 'leverage', business-wallpaper verb.", fix: "Usa un verbo directo: 'usar', 'aprovechar', o describe la acción.", rewrite: "" },
  { id: "es-w-optimizar", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])optimizar(?![\\p{L}\\p{N}])", desc: "'Optimizar' — a promise without a measurement.", fix: "Explica qué proceso mejora y en cuánto.", rewrite: "" },
  { id: "es-w-seamless", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])seamless(?![\\p{L}\\p{N}])", desc: "El anglicismo 'seamless' usado tal cual — 'experiencia seamless'; una afirmación de fricción sin evidencia.", fix: "Describe en español qué paso resulta sencillo.", rewrite: "" },
  { id: "es-w-innovador", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])innovador(?:a|as|es)?(?![\\p{L}\\p{N}])", desc: "'Innovador' — self-describing novelty; nothing is shown to be new.", fix: "Muestra qué es lo que realmente cambia.", rewrite: "" },
  { id: "es-w-revolucionario", category: "word-ban", severity: 3, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])revolucionari(?:a|as|os)?(?![\\p{L}\\p{N}])", desc: "'Revolucionario' — the grandest claim in the vocabulary, applied to ordinary upgrades.", fix: "Describe el cambio real.", rewrite: "" },
  { id: "es-w-excelente", category: "word-ban", severity: 1, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])excelente(?![\\p{L}\\p{N}])", desc: "'Excelente' — the downloadable adjective applied to everything.", fix: "Di la cualidad concreta.", rewrite: "" },

  // ------------------------------------------------------------------
  // throat-clearing
  // ------------------------------------------------------------------
  { id: "es-t-en-este-articulo", category: "throat-clearing", severity: 2, kind: "regex", flags: "giu", match: "en este artículo", desc: "'En este artículo veremos…' — metacommentary about the article inside the article.", fix: "Empieza a desarrollar; el lector ya está en el artículo.", rewrite: "" },
  { id: "es-t-tengas-en-cuenta", category: "throat-clearing", severity: 1, kind: "regex", flags: "giu", match: "ten en cuenta que", desc: "'Ten en cuenta que…' — directs the reader by command instead of by content.", fix: "Destaque la esencia con el texto mismo.", rewrite: "" },
  { id: "es-t-sin-duda", category: "throat-clearing", severity: 1, kind: "regex", flags: "giu", match: "sin (?:lugar a )?duda(?: alguna)?", desc: "'Sin duda alguna…' — assurance performed instead of argued.", fix: "Di el hecho y el argumento.", rewrite: "" },
  { id: "es-t-es-importante-recordar", category: "throat-clearing", severity: 2, kind: "regex", flags: "giu", match: "es importante recordar", desc: "'Es importante recordar que…' — requests attention instead of earning it.", fix: "Expón la idea; el lector recordará lo que importa.", rewrite: "" },

  // ------------------------------------------------------------------
  // summary-recap
  // ------------------------------------------------------------------
  { id: "es-s-en-conclusion", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "en conclusión(?:[,: ]|$)", desc: "'En conclusión…' — the formal recap opener.", fix: "Termina con el último punto concreto.", rewrite: "" },
  { id: "es-s-en-resumen", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "en resumen", desc: "'En resumen…' — restates the piece inside the piece.", fix: "Elimina el re-resumen.", rewrite: "" },
  { id: "es-s-para-finalizar", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "para finalizar", desc: "'Para finalizar, cabe decir…' — a recap signpost with no new content.", fix: "Sé concluyente sin anunciar la conclusión.", rewrite: "" },

  // ------------------------------------------------------------------
  // weasel-attribution
  // ------------------------------------------------------------------
  { id: "es-wz-expertos-coinciden", category: "weasel-attribution", severity: 3, kind: "regex", flags: "giu", match: "los expertos (?:coinciden|afirman|aseguran)", desc: "'Los expertos coinciden' — an invisible college that agrees whenever asked.", fix: "Nombra a un experto concreto o elimínalo.", rewrite: "" },
  { id: "es-wz-estudios-demuestran", category: "weasel-attribution", severity: 3, kind: "regex", flags: "giu", match: "(?:los )?estudios (?:demuestran|muestran)", desc: "'Los estudios demuestran' — citation by plural, no paper attached.", fix: "Cita un estudio concreto.", rewrite: "" },

  // ------------------------------------------------------------------
  // business-jargon
  // ------------------------------------------------------------------
  { id: "es-b-transformacion-digital", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "transformación digital", desc: "'Transformación digital' — the packaged phrase for any modernization claim.", fix: "Nombra qué es lo que cambia de verdad.", rewrite: "" },
  { id: "es-b-solucion-integral", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "solución integral", desc: "'Solución integral' — the comprehensive-solution claim that names nothing.", fix: "Describe la solución en sí.", rewrite: "" },
  { id: "es-b-ultima-tecnologia", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "(?:la )?(?:última|más avanzada) tecnología", desc: "'La última tecnología' — frontier status by phrase rather than by measurement.", fix: "Nombra la tecnología concreta y su resultado.", rewrite: "" },
  { id: "es-b-vanguardia", category: "business-jargon", severity: 1, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])vanguardia(?![\\p{L}\\p{N}])", desc: "'A la vanguardia' — frontier status by noun.", fix: "Muestra el avance real.", rewrite: "" },
  { id: "es-b-jugar-un-papel", category: "business-jargon", severity: 1, kind: "regex", flags: "giu", match: "juega un papel (?:clave|importante|fundamental)", desc: "'Juega un papel clave' — the importance default in Spanish.", fix: "Nombra el efecto de ese papel.", rewrite: "" },

  // ------------------------------------------------------------------
  // es-copy-tics — a NEW category appended by this file
  // ------------------------------------------------------------------
  { id: "es-c-hoy-en-dia", category: "es-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "hoy en día", desc: "'Hoy en día' — a status marker models add to sound current.", fix: "Di qué es válido ahora, o dale una fecha.", rewrite: "" },
  { id: "es-c-excepcional", category: "es-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])excepcional(?:es)?(?![\\p{L}\\p{N}])", desc: "'Excepcional' — the superior superlative for anything above average.", fix: "Muestra en qué se distingue exactamente.", rewrite: "" },
  { id: "es-c-animo-lector", category: "es-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "a seguir leyendo|podríamos decir que", desc: "'Te animamos a seguir leyendo' / 'podríamos decir que' — the filler encouragements and hedges.", fix: "Confía en el contenido; el lector decidirá.", rewrite: "" },
  { id: "es-c-sumarvalor", category: "es-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "sumar valor", desc: "'Sumar valor' — value performed by phrase.", fix: "Describe el valor que se aporta.", rewrite: "" },
  { id: "es-c-experiencia-optima", category: "es-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "experiencia óptima", desc: "'Para una experiencia óptima' — the package-default promise.", fix: "Describe la experiencia real.", rewrite: "" },
  { id: "es-c-entorno-competitivo", category: "es-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "entorno competitivo", desc: "'En un entorno competitivo' — the 'competitive landscape' preamble.", fix: "Nombra al competidor o la condición real.", rewrite: "" },
  { id: "es-c-cada-vez-mas-empresas", category: "es-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "cada vez más empresas", desc: "'Cada vez más empresas eligen…' — trend by anonymous plural.", fix: "Cita un caso o un número verificable.", rewrite: "" },
  { id: "es-c-equipo-dedicado", category: "es-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "equipo dedicado", desc: "'Nuestro equipo dedicado' — the staffing default.", fix: "Describe lo que el equipo hace.", rewrite: "" },
];

return {
  version: "1.0.0-es",
  categories: CATEGORIES,
  patterns: PATTERNS,
};
});