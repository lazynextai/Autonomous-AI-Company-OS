"use strict";
/**
 * Lazynext AI Slop Checker — French sample rules (data/rules.fr.js).
 *
 * An ORIGINAL, Lazynext-written sample of French AI-slop tells, shipped on
 * the same external-rules extension path as data/rules.ru.js,
 * data/rules.hi.js and data/rules.es.js. Consumed with
 *
 *   node api/cli.js --rules data/rules.fr.js "Dans le monde d'aujourd'hui..."
 *
 * French model-generated copy leans on its own dialect of the same tells:
 * epoch openers ("dans le monde d'aujourd'hui", "à l'ère du numérique"),
 * throat-clearing ("il est important de noter", "il convient de souligner"),
 * anglicisms kept raw or calqued ("seamless", "transformation digitale",
 * "game-changer"), business soup ("synergie", "valeur ajoutée"),
 * generic superlatives ("innovant", "révolutionnaire"), and recap openers
 * ("en conclusion", "pour résumer"). Every description and fix was written
 * by Lazynext from knowledge of French copy conventions, not copied from
 * any source repository.
 *
 * Pattern format matches data/slop-patterns.js: id, category, severity,
 * kind (word|phrase|regex), match, desc, fix, flags. Categories reuse the
 * base ids where the tell belongs (filler-phrases, word-ban,
 * throat-clearing, summary-recap, weasel-attribution, business-jargon) and
 * APPEND one new category (fr-copy-tics) per the "new categories appended"
 * merge rule.
 *
 * Case handling follows the ru/hi/es files: kind "regex" with flags "giu",
 * and Unicode-aware boundaries for single-word tells so accented letters
 * (é, è, à, ç…) are treated as letters, not word boundaries.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopPatternsFr = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {

const CATEGORIES = [
  {
    id: "fr-copy-tics",
    name: "French copy tics",
    desc: "The factory vocabulary of French AI-generated copy: anglicisms, assurance words and padded superlatives that perfume a claim instead of making it.",
  },
];

const PATTERNS = [
  // ------------------------------------------------------------------
  // filler-phrases — epoch openers, French edition
  // ------------------------------------------------------------------
  { id: "fr-f-monde-aujourdhui", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "dans le monde d'aujourd'hui", desc: "'Dans le monde d'aujourd'hui' — the epoch-inflation opener; whichever topic follows is never actually a world.", fix: "Commencez par le fait concret, sans le préambule sur le monde.", rewrite: "" },
  { id: "fr-f-ere-numerique", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "à l'ère du numérique", desc: "'À l'ère du numérique' — inflation de l'époque: le numérique n'est plus une époque, c'est la normale.", fix: "Nommez le changement concret auquel vous pensez.", rewrite: "" },
  { id: "fr-f-monde-constante", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "dans un monde en constante évolution", desc: "'Dans un monde en constante évolution' — the fast-changing-world preamble, French edition.", fix: "Nommez l'évolution précise dont il s'agit.", rewrite: "" },
  { id: "fr-f-il-est-important", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "il est important de noter", desc: "'Il est important de noter que…' — announces significance before delivering it.", fix: "Énoncez le fait; le lecteur jugera.", rewrite: "" },
  { id: "fr-f-il-convient", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "il convient de souligner", desc: "'Il convient de souligner que…' — pre-announces an emphasis that should land on its own.", fix: "Dites ce que vous vouliez souligner.", rewrite: "" },
  { id: "fr-f-il-est-a-noter", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "il est à noter que", desc: "'Il est à noter que…' — the administrative 'worth noting', an attention request before the fact.", fix: "Énoncez le fait directement.", rewrite: "" },

  // ------------------------------------------------------------------
  // word-ban — anglicisms + generic superlatives (Unicode-aware)
  // ------------------------------------------------------------------
  { id: "fr-w-seamless", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?:expérience|solution|intégration|parcours|paiement) seamless\\b", desc: "L'anglicisme 'seamless' collé après un nom français — 'une expérience seamless', 'une solution seamless'; une promesse de fluidité sans aucune évidence.", fix: "Décrivez en français quelle étape devient simple.", rewrite: "" },
  { id: "fr-w-optimiser", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "optimiser(?: les)? (?:processus|flux|performances)", desc: "'Optimiser les processus' — une promesse sans mesure, le réflexe business de l'IA.", fix: "Expliquez quel processus change et de combien.", rewrite: "" },
  { id: "fr-w-innovant", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])innovant(?:es?|s)?(?![\\p{L}\\p{N}])", desc: "'Innovant' — une nouveauté qui se déclare sans se montrer.", fix: "Montrez ce qui change concrètement.", rewrite: "" },
  { id: "fr-w-revolutionnaire", category: "word-ban", severity: 3, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])révolutionnaire(?:s)?(?![\\p{L}\\p{N}])", desc: "'Révolutionnaire' — la plus grosse des réclamations, appliquée à des mises à jour ordinaires.", fix: "Décrivez le changement réel.", rewrite: "" },
  { id: "fr-w-exceptionnel", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])exceptionnel(?:le)?(?:s)?(?![\\p{L}\\p{N}])", desc: "'Exceptionnel' — le superlatif téléchargé et appliqué à tout.", fix: "Dites la qualité concrète.", rewrite: "" },
  { id: "fr-w-disruptif", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])disruptif(?:ve)?(?:s)?(?![\\p{L}\\p{N}])", desc: "'Disruptif' — le mot-valise de l'innovation; il annonce une rupture sans la décrire.", fix: "Décrivez ce qui casse réellement le modèle existant.", rewrite: "" },

  // ------------------------------------------------------------------
  // throat-clearing
  // ------------------------------------------------------------------
  { id: "fr-t-dans-cet-article", category: "throat-clearing", severity: 2, kind: "regex", flags: "giu", match: "dans cet article", desc: "'Dans cet article, nous verrons…' — métacommentaire sur l'article à l'intérieur de l'article.", fix: "Commencez le développement; le lecteur est déjà dans l'article.", rewrite: "" },
  { id: "fr-t-noublions-pas", category: "throat-clearing", severity: 2, kind: "regex", flags: "giu", match: "n['’]oublions pas que", desc: "'N'oublions pas que…' — un rappel à l'ordre avant le fait lui-même.", fix: "Énoncez le fait.", rewrite: "" },
  { id: "fr-t-essentiel-comprendre", category: "throat-clearing", severity: 2, kind: "regex", flags: "giu", match: "il est essentiel de comprendre", desc: "'Il est essentiel de comprendre que…' — exige l'attention au lieu de la mériter.", fix: "Exposez l'idée; le lecteur comprendra.", rewrite: "" },
  { id: "fr-t-sans-nul-doute", category: "throat-clearing", severity: 1, kind: "regex", flags: "giu", match: "sans nul doute", desc: "'Sans nul doute' — une assurance jouée au lieu d'être argumentée.", fix: "Dites le fait et l'argument.", rewrite: "" },

  // ------------------------------------------------------------------
  // summary-recap
  // ------------------------------------------------------------------
  { id: "fr-s-en-conclusion", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "en conclusion(?:[,:]|$)", desc: "'En conclusion…' — l'ouverture du récapitulatif pompeux.", fix: "Terminez sur le dernier point concret.", rewrite: "" },
  { id: "fr-s-pour-resumer", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "pour résumer", desc: "'Pour résumer…' — réexpose le texte à l'intérieur du texte.", fix: "Supprimez le réexposé.", rewrite: "" },
  { id: "fr-s-en-resume", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "en résumé(?:[,:]|$)", desc: "'En résumé…' — le panneau de fin sans contenu nouveau.", fix: "Concluez sans annoncer la conclusion.", rewrite: "" },

  // ------------------------------------------------------------------
  // weasel-attribution
  // ------------------------------------------------------------------
  { id: "fr-wz-experts", category: "weasel-attribution", severity: 3, kind: "regex", flags: "giu", match: "les experts s['’]accordent", desc: "'Les experts s'accordent à dire' — un collège invisible qui est d'accord à la demande.", fix: "Citez un expert précis ou retirez la référence.", rewrite: "" },
  { id: "fr-wz-etudes", category: "weasel-attribution", severity: 3, kind: "regex", flags: "giu", match: "(?:les )?études (?:montrent|démontrent)", desc: "'Les études montrent' — citation par pluriel, sans papier attaché.", fix: "Citez une étude précise.", rewrite: "" },

  // ------------------------------------------------------------------
  // business-jargon
  // ------------------------------------------------------------------
  { id: "fr-b-transformation-digitale", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "transformation digitale", desc: "'Transformation digitale' — l'anglicisme emballé qui remplace 'transformation numérique' et ne nomme rien de concret.", fix: "Dites ce qui change vraiment.", rewrite: "" },
  { id: "fr-b-solution-integree", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "solution intégrée", desc: "'Solution intégrée' — le couple que l'IA pose sur n'importe quel produit.", fix: "Décrivez la solution elle-même.", rewrite: "" },
  { id: "fr-b-valeur-ajoutee", category: "business-jargon", severity: 1, kind: "regex", flags: "giu", match: "valeur ajoutée", desc: "'Valeur ajoutée' — la valeur promise par le mot, sans mécanisme.", fix: "Décrivez le bénéfice concret.", rewrite: "" },
  { id: "fr-b-synergie", category: "business-jargon", severity: 3, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])synergie(?:s)?(?![\\p{L}\\p{N}])", desc: "'Synergie' — le mot fétiche du consulting; il affirme un effet combiné sans le décrire.", fix: "Décrivez l'effet combiné précis.", rewrite: "" },
  { id: "fr-b-excellence-operationnelle", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "excellence opérationnelle", desc: "'Excellence opérationnelle' — le trophée de gestion posé sur n'importe quel processus.", fix: "Montrez le processus et son résultat.", rewrite: "" },

  // ------------------------------------------------------------------
  // fr-copy-tics — a NEW category appended by this file
  // ------------------------------------------------------------------
  { id: "fr-c-game-changer", category: "fr-copy-tics", severity: 3, kind: "regex", flags: "giu", match: "game[- ]changer", desc: "'Game-changer' est utilisé tel quel en français — l'anglicisme superlatif pour une fonction ordinaire.", fix: "Montrez la différence avant/après.", rewrite: "" },
  { id: "fr-c-haut-de-gamme", category: "fr-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "haut[- ]de[- ]gamme", desc: "'Haut de gamme' — le qualificatif posé sur tout service moderne pour le rehausser.", fix: "Montrez en quoi c'est haut de gamme.", rewrite: "" },
  { id: "fr-c-sans-precedent", category: "fr-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "sans précédent", desc: "'Sans précédent' — la réclamation la plus forte du vocabulaire, appliquée à l'ordinaire.", fix: "Décrivez le changement réel.", rewrite: "" },
  { id: "fr-c-mettre-en-lumiere", category: "fr-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "mettre en lumière", desc: "'Mettre en lumière' — le geste de mise en évidence qui remplace l'évidence elle-même.", fix: "Montrez le fait.", rewrite: "" },
  { id: "fr-c-large-eventail", category: "fr-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "un large éventail", desc: "'Un large éventail de…' — l'inventaire vague qui promet de la variété sans la lister.", fix: "Listez ce qui est proposé.", rewrite: "" },
  { id: "fr-c-experience-optimale", category: "fr-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "expérience (?:utilisateur )?optimale", desc: "'Une expérience utilisateur optimale' — la promesse par défaut du package.", fix: "Décrivez l'expérience réelle.", rewrite: "" },
];

return {
  version: "1.0.0-fr",
  categories: CATEGORIES,
  patterns: PATTERNS,
};
});