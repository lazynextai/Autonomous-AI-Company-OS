"use strict";
/**
 * Lazynext AI Slop Checker — German sample rules (data/rules.de.js).
 *
 * An ORIGINAL, Lazynext-written sample of German AI-slop tells, shipped on
 * the same external-rules extension path as data/rules.ru.js,
 * data/rules.hi.js, data/rules.es.js and data/rules.fr.js. Consumed with
 *
 *   node api/cli.js --rules data/rules.de.js "In der heutigen schnelllebigen Welt..."
 *
 * German model-generated copy leans on its own dialect of the same tells:
 * epoch openers ("in der heutigen schnelllebigen Welt", "im digitalen
 * Zeitalter"), throat-clearing ("es ist wichtig zu erwähnen",
 * "es sei darauf hingewiesen"), the seamless calque ("nahtlos"),
 * consulting soup ("Synergien", "Mehrwert", "ganzheitlich"), generic
 * superlatives ("innovativ", "revolutionär", "einzigartig"), and recap
 * openers ("zusammenfassend", "abschließend lässt sich sagen"). Every
 * description and fix was written by Lazynext from knowledge of German copy
 * conventions, not copied from any source repository.
 *
 * Pattern format matches data/slop-patterns.js: id, category, severity,
 * kind (word|phrase|regex), match, desc, fix, flags. Categories reuse the
 * base ids where the tell belongs (filler-phrases, word-ban,
 * throat-clearing, summary-recap, weasel-attribution, business-jargon) and
 * APPEND one new category (de-copy-tics) per the "new categories appended"
 * merge rule.
 *
 * Case handling follows the other i18n files: kind "regex" with flags
 * "giu". German compounds are capitalised mid-sentence ("Synergien",
 * "Mehrwert"), so case-insensitive matching is essential — but single-word
 * tells still get Unicode-aware boundaries so umlauts (ä, ö, ü, ß) count
 * as letters, not word boundaries. Ids are ASCII-transliterated
 * (ae/oe/ue/ss) because pattern ids must match ^[a-z][a-z0-9-]*$; the
 * match strings keep the real umlauts.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopPatternsDe = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {

const CATEGORIES = [
  {
    id: "de-copy-tics",
    name: "German copy tics",
    desc: "The factory vocabulary of German AI-generated copy: assurance words, seamless-calques and padded superlatives that dress up a claim instead of making it.",
  },
];

const PATTERNS = [
  // ------------------------------------------------------------------
  // filler-phrases — epoch openers, German edition
  // ------------------------------------------------------------------
  { id: "de-f-heutigen-schnelllebigen", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "in der heutigen schnelllebigen Welt", desc: "'In der heutigen schnelllebigen Welt' — the fast-paced-world preamble, German edition.", fix: "Nennen Sie die konkrete Veränderung.", rewrite: "" },
  { id: "de-f-modernen-welt", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "in der modernen Welt", desc: "'In der modernen Welt' — die Epochen-Inflation: Das Thema ist nie die ganze Welt.", fix: "Sagen Sie, was Sie genau meinen, ohne die Welt-Passage.", rewrite: "" },
  { id: "de-f-digitalen-zeitalter", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "im (?:digitalen|modernen) Zeitalter", desc: "'Im digitalen Zeitalter' — epoch-name inflation for a routine state of affairs.", fix: "Nennen Sie die konkrete Veränderung.", rewrite: "" },
  { id: "de-f-wichtig-zu-erwaehnen", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "es ist wichtig zu erwähnen", desc: "'Es ist wichtig zu erwähnen, dass…' — kündigt Bedeutung an, statt sie zu liefern.", fix: "Nennen Sie die Tatsache; die Leser urteilen selbst.", rewrite: "" },
  { id: "de-f-es-sei-darauf", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "es sei darauf hingewiesen", desc: "'Es sei darauf hingewiesen, dass…' — die konjunktivische Räusper-Passage vor dem Fakt.", fix: "Nennen Sie die Tatsache direkt.", rewrite: "" },
  { id: "de-f-im-grunde", category: "filler-phrases", severity: 1, kind: "regex", flags: "giu", match: "im grunde (?:genommen)?", desc: "'Im Grunde genommen' — ein Kernversprechen, das keinen Kern liefert.", fix: "Sagen Sie, was gemeint ist.", rewrite: "" },

  // ------------------------------------------------------------------
  // word-ban — anglicisms, calques + generic superlatives
  // ------------------------------------------------------------------
  { id: "de-w-nahtlos", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])nahtlos(?:e|en|er|es)?(?![\\p{L}\\p{N}])", desc: "'Nahtlos' — der deutsche 'nahtlose-Erfahrung'-Kalque für jedes integrierte System.", fix: "Beschreiben Sie, welcher Schritt tatsächlich einfacher wird.", rewrite: "" },
  { id: "de-w-ganzheitlich", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])ganzheitlich(?:e|en|er|es)?(?![\\p{L}\\p{N}])", desc: "'Ganzheitlich' — das holistische Füllwort der Beratersprache, das nichts über den Inhalt sagt.", fix: "Beschreiben Sie, was genau abgedeckt ist.", rewrite: "" },
  { id: "de-w-innovativ", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])innovativ(?:e|en|er|es)?(?![\\p{L}\\p{N}])", desc: "'Innovativ' — Neuheit, die sich selbst beschreibt, ohne sie zu zeigen.", fix: "Zeigen Sie, was sich konkret ändert.", rewrite: "" },
  { id: "de-w-revolutionaer", category: "word-ban", severity: 3, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])revolutionär(?:e|en|er|es)?(?![\\p{L}\\p{N}])", desc: "'Revolutionär' — die größte aller Behauptungen, angewendet auf gewöhnliche Updates.", fix: "Beschreiben Sie die tatsächliche Änderung.", rewrite: "" },
  { id: "de-w-einzigartig", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])einzigartig(?:e|en|er|es)?(?![\\p{L}\\p{N}])", desc: "'Einzigartig' — das stärkste Unterscheidungs-Wort, angewendet auf alles.", fix: "Nennen Sie den konkreten Unterschied.", rewrite: "" },
  { id: "de-w-optimieren", category: "word-ban", severity: 1, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])optimieren(?![\\p{L}\\p{N}])", desc: "'Optimieren' — ein Versprechen ohne Messung, das Standard-Wort des KI-Ai-Plans.", fix: "Beschreiben Sie, welcher Prozess sich wie verbessert.", rewrite: "" },

  // ------------------------------------------------------------------
  // throat-clearing
  // ------------------------------------------------------------------
  { id: "de-t-in-diesem-artikel", category: "throat-clearing", severity: 2, kind: "regex", flags: "giu", match: "in diesem Artikel", desc: "'In diesem Artikel werden wir…' — Metakommentar über den Artikel im Artikel selbst.", fix: "Beginnen Sie den Inhalt; die Leser sind bereits im Artikel.", rewrite: "" },
  { id: "de-t-nicht-zu-vergessen", category: "throat-clearing", severity: 1, kind: "regex", flags: "giu", match: "nicht zu vergessen", desc: "'Nicht zu vergessen…' — ein Erinnerungs-Befehl statt des Inhalts.", fix: "Nennen Sie die Sache, die nicht vergessen werden soll.", rewrite: "" },
  { id: "de-t-wichtig-zu-verstehen", category: "throat-clearing", severity: 2, kind: "regex", flags: "giu", match: "es ist wichtig zu verstehen", desc: "'Es ist wichtig zu verstehen, dass…' — fordert Aufmerksamkeit, statt sie sich zu verdienen.", fix: "Legen Sie die Idee dar.", rewrite: "" },
  { id: "de-t-man-sollte-bedenken", category: "throat-clearing", severity: 2, kind: "regex", flags: "giu", match: "man sollte bedenken", desc: "'Man sollte bedenken, dass…' — ein Räusper-Aufruf vor der Information.", fix: "Nennen Sie die Information.", rewrite: "" },

  // ------------------------------------------------------------------
  // summary-recap
  // ------------------------------------------------------------------
  { id: "de-s-zusammenfassend", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "zusammenfassend", desc: "'Zusammenfassend lässt sich sagen…' — der formelle Recap-Einstieg.", fix: "Beenden Sie mit dem letzten konkreten Punkt.", rewrite: "" },
  { id: "de-s-abschliessend", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "abschließend lässt sich sagen", desc: "'Abschließend lässt sich sagen…' — wiederholt das Stück im Stück.", fix: "Stellen Sie die Schlussfolgerung direkt dar.", rewrite: "" },
  { id: "de-s-fazit", category: "summary-recap", severity: 1, kind: "regex", flags: "giu", match: "(?:^|[.!?]\\s+)Fazit\\s*:", desc: "'Fazit:' — das Endelement mit Doppelpunkt, das die Zusammenfassung ankündigt.", fix: "Sagen Sie die Schlussfolgerung ohne Ankündigung.", rewrite: "" },

  // ------------------------------------------------------------------
  // weasel-attribution
  // ------------------------------------------------------------------
  { id: "de-wz-experten", category: "weasel-attribution", severity: 3, kind: "regex", flags: "giu", match: "experten sind sich einig", desc: "'Experten sind sich einig' — ein unsichtbares Gremium, das auf Abruf zustimmt.", fix: "Nennen Sie einen konkreten Experten oder streichen Sie die Behauptung.", rewrite: "" },
  { id: "de-wz-studien", category: "weasel-attribution", severity: 3, kind: "regex", flags: "giu", match: "studien zeigen", desc: "'Studien zeigen' — der Plural als Zitat, ohne Studie.", fix: "Zitieren Sie eine konkrete Studie.", rewrite: "" },

  // ------------------------------------------------------------------
  // business-jargon
  // ------------------------------------------------------------------
  { id: "de-b-digitale-transformation", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "digitale transformation", desc: "'Digitale Transformation' — das Verpackungs-Etikett für jede Modernisierungsbehauptung.", fix: "Nennen Sie, was sich konkret ändert.", rewrite: "" },
  { id: "de-b-synergien", category: "business-jargon", severity: 3, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])synergien?(?: nutzen| heben)?(?![\\p{L}\\p{N}])", desc: "'Synergien nutzen' — das Berater-Wort für einen gemeinsamen Effekt, der nie beschrieben wird.", fix: "Beschreiben Sie den konkreten gemeinsamen Effekt.", rewrite: "" },
  { id: "de-b-mehrwert", category: "business-jargon", severity: 1, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])mehrwert(?![\\p{L}\\p{N}])", desc: "'Mehrwert' — der Wert, den das Wort verspricht, ohne einen Mechanismus.", fix: "Beschreiben Sie den konkreten Nutzen.", rewrite: "" },
  { id: "de-b-wertschoepfung", category: "business-jargon", severity: 1, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])wertschöpfung(?![\\p{L}\\p{N}])", desc: "'Wertschöpfung' — Fachterminus als Füllwort für jeden Aktivitätenplan.", fix: "Beschreiben Sie, was hergestellt oder verbessert wird.", rewrite: "" },
  { id: "de-b-prozessoptimierung", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])prozessoptimierung(?![\\p{L}\\p{N}])", desc: "'Prozessoptimierung' — das Wandbild des Consulting: nichts wird gesagt zu Tempo oder Kosten.", fix: "Beschreiben Sie, welcher Prozess wie schneller oder billiger wird.", rewrite: "" },

  // ------------------------------------------------------------------
  // de-copy-tics — a NEW category appended by this file
  // ------------------------------------------------------------------
  { id: "de-c-heutzutage", category: "de-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])heutzutage(?![\\p{L}\\p{N}])", desc: "'Heutzutage' — der Status-Marker, mit dem Modelle aktuell klingen wollen.", fix: "Sagen Sie, was jetzt gilt, oder nennen Sie ein Datum.", rewrite: "" },
  { id: "de-c-von-grosser-bedeutung", category: "de-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "von großer bedeutung", desc: "'Von großer Bedeutung' — der Wichtigkeits-Aufkleber, der den Beleg ersetzt.", fix: "Nennen Sie die Auswirkung.", rewrite: "" },
  { id: "de-c-vielzahl", category: "de-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "eine vielzahl von", desc: "'Eine Vielzahl von…' — der vage Mengen-Ausdruck, der Vielfalt verspricht, ohne sie zu zeigen.", fix: "Listen Sie auf, was es gibt.", rewrite: "" },
  { id: "de-c-nicht-zuletzt", category: "de-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "nicht zuletzt", desc: "'Nicht zuletzt' — ein rhetorisches Zusatzgewicht am Satzende.", fix: "Streichen Sie die Floskel; der letzte Punkt trägt allein.", rewrite: "" },
  { id: "de-c-es-versteht-sich", category: "de-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "es versteht sich von selbst", desc: "'Es versteht sich von selbst, dass…' — behauptet Selbstverständlichkeit statt zu argumentieren.", fix: "Sagen Sie die Sache, die selbstverständlich ist.", rewrite: "" },
  { id: "de-c-massgeschneidert", category: "de-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])maßgeschneidert(?:e|en|er|es)?(?![\\p{L}\\p{N}])", desc: "'Maßgeschneidert' — das Schneider-Image für jedes anpassbare Produkt, ohne dass ein Anpassungsbeispiel kommt.", fix: "Zeigen Sie ein konkretes Anpassungsbeispiel.", rewrite: "" },
];

return {
  version: "1.0.0-de",
  categories: CATEGORIES,
  patterns: PATTERNS,
};
});