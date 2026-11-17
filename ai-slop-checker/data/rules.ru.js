"use strict";
/**
 * Lazynext AI Slop Checker — Russian sample rules (data/rules.ru.js).
 *
 * An ORIGINAL, Lazynext-written sample of Russian AI-slop tells, shipped to
 * demonstrate the external-rules extension mechanism as the general i18n
 * path: this file is a plain custom corpus payload, consumed with
 *
 *   node api/cli.js --rules data/rules.ru.js "В современном мире..."
 *   const merged = require("./src/rules-loader.js").loadRules("data/rules.ru.js");
 *
 * Russian model-generated copy leans on its own dialect of the same tells
 * the base corpus hunts in English: throat-clearing openers ("стоит
 * отметить", "нельзя не отметить"), epoch inflation ("в современном
 * мире", "в эпоху цифровизации"), summary recaps ("подводя итог"), weasel
 * attribution ("эксперты считают"), and a factory vocabulary ("инновационный
 * подход", "комплексное решение", "синергия"). This file lists the
 * tell-phrases themselves; every description, fix, and the whole corpus were
 * written by Lazynext from knowledge of Russian copy conventions, not copied
 * from any source repository.
 *
 * Pattern format matches data/slop-patterns.js: id, category, severity,
 * kind (word|phrase|regex), match, desc, fix, optional flags. Categories
 * reuse the base ids where the tell belongs (filler-phrases, word-ban,
 * throat-clearing, summary-recap, weasel-attribution) and APPEND one new
 * category (ru-copy-tics) to demonstrate the "new categories appended"
 * merge rule.
 *
 * Note on word boundaries: JavaScript `\b` is ASCII-only, so single-word
 * tells use kind "regex" with Unicode-aware boundaries and the "u" flag.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopPatternsRu = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {

const CATEGORIES = [
  {
    id: "ru-copy-tics",
    name: "Russian copy tics",
    desc: "The factory vocabulary of Russian AI-generated copy: pseudo-scientific assurance words that pad a claim instead of making it.",
  },
];

const PATTERNS = [
  // ------------------------------------------------------------------
  // filler-phrases — epoch inflation + throat-clearing, Russian edition
  // ------------------------------------------------------------------
  { id: "ru-f-v-sovremennom-mire", category: "filler-phrases", severity: 2, kind: "phrase", match: "в современном мире", desc: "'В современном мире' — the epoch-inflation opener, Russian edition: whichever topic follows is never actually a whole world.", fix: "Скажите, что именно вы имеете в виду, без вступления про весь мир.", rewrite: "" },
  { id: "ru-f-v-nashe-vremya", category: "filler-phrases", severity: 1, kind: "phrase", match: "в наше время", desc: "'В наше время' backgrounds any claim in a vague now.", fix: "Уберите вступление и начните с факта.", rewrite: "" },
  { id: "ru-f-bystro-menyayush", category: "filler-phrases", severity: 2, kind: "phrase", match: "быстро меняющ", desc: "'В быстро меняющемся мире' — the fast-paced-world preamble in Russian.", fix: "Назовите конкретное изменение.", rewrite: "" },
  { id: "ru-f-stand-to-otmetit", category: "filler-phrases", severity: 2, kind: "phrase", match: "стоит отметить", desc: "'Стоит отметить, что…' — announces significance before delivering it; a direct translation of 'it's worth noting'.", fix: "Скажите факт; читатель сам оценит.", rewrite: "" },
  { id: "ru-f-nelzya-ne-otmetit", category: "filler-phrases", severity: 2, kind: "phrase", match: "нельзя не отметить", desc: "Double-negation throat-clearing: 'one cannot fail to note' — emphasis by ritual.", fix: "Отметьте сразу, без двойного отрицания.", rewrite: "" },
  { id: "ru-f-vazhno-ponimat", category: "filler-phrases", severity: 2, kind: "phrase", match: "важно понимать", desc: "'Важно понимать' — requests attention instead of earning it.", fix: "Изложите мысль; читатель поймёт.", rewrite: "" },
  { id: "ru-f-stoit-podcherknut", category: "filler-phrases", severity: 2, kind: "phrase", match: "стоит подчеркнуть", desc: "'Стоит подчеркнуть' — a solemn pre-announcement of an emphasis that should just land.", fix: "Скажите то, что хотели подчеркнуть.", rewrite: "" },
  { id: "ru-f-hochetsya-otmetit", category: "filler-phrases", severity: 1, kind: "phrase", match: "хочется отметить", desc: "'Хочется отметить' — a wish to note, delivered instead of the note.", fix: "Отметьте.", rewrite: "" },
  { id: "ru-f-davai-pogruzimsya", category: "filler-phrases", severity: 2, kind: "phrase", match: "давайте погрузимся", desc: "'Давайте погрузимся' — the 'let's dive in' transition, Russian edition.", fix: "Начните следующий раздел.", rewrite: "" },
  { id: "ru-f-davai-razberemsya", category: "filler-phrases", severity: 1, kind: "phrase", match: "давайте разберёмся", desc: "'Давайте разберёмся' pre-announces the analysis instead of doing it.", fix: "Разберитесь в тексте.", rewrite: "" },

  // ------------------------------------------------------------------
  // word-ban — single-word vocabulary tells (Unicode-aware boundaries)
  // ------------------------------------------------------------------
  { id: "ru-w-sinergiya", category: "word-ban", severity: 3, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])синергия(?![\\p{L}\\p{N}])", desc: "'Синергия' — the all-time business buzzword, in Russian; models reach for it in any collaboration paragraph.", fix: "Опишите, какой именно эффект возникает при взаимодействии.", rewrite: "" },
  { id: "ru-w-innovatsion", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])инновационн(?:ый|ая|ое|ые|ого|ой|ому|ыми|ых|ым)(?![\\p{L}\\p{N}])", desc: "'Инновационный' — self-describing novelty; nothing is shown to be new.", fix: "Покажите, что именно отличается.", rewrite: "" },
  { id: "ru-w-unikal", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])уникальн(?:ый|ая|ое|ые|ого|ой|ому|ыми|ых|ым)(?![\\p{L}\\p{N}])", desc: "'Уникальный' — the strongest downloadable adjective, applied to everything.", fix: "Опишите, в чём именно отличие.", rewrite: "" },
  { id: "ru-w-effektivn", category: "word-ban", severity: 1, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])эффективн(?:ый|ая|ое|ые|ого|ой|ому|ыми|ых|ым)(?![\\p{L}\\p{N}])", desc: "'Эффективный' — an assessment without evidence; the standard filler praise word.", fix: "Покажите измеряемый результат.", rewrite: "" },
  { id: "ru-w-gluboko", category: "word-ban", severity: 1, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])углубимся(?![\\p{L}\\p{N}])", desc: "'Углубимся' — the 'let's delve' gesture that promises depth by verb.", fix: "Покажите глубину содержанием.", rewrite: "" },

  // ------------------------------------------------------------------
  // throat-clearing
  // ------------------------------------------------------------------
  { id: "ru-t-v-etoy-state", category: "throat-clearing", severity: 2, kind: "phrase", match: "в этой статье", desc: "'В этой статье мы рассмотрим…' — metacommentary about the article inside the article.", fix: "Начните рассмотрение; читатель уже в статье.", rewrite: "" },
  { id: "ru-t-v-dannoy-state", category: "throat-clearing", severity: 1, kind: "phrase", match: "в данной статье", desc: "Formal sibling of 'в этой статье'.", fix: "Уберите самоупоминание.", rewrite: "" },
  { id: "ru-t-obratite-vnimanie", category: "throat-clearing", severity: 1, kind: "phrase", match: "обратите внимание", desc: "'Обратите внимание…' directs the reader by command instead of by content.", fix: "Выделите суть текстом.", rewrite: "" },
  { id: "ru-t-s-uverennostyu", category: "throat-clearing", severity: 2, kind: "phrase", match: "с уверенностью можно сказать", desc: "False assurance: 'one can say with confidence' pre-argues the conclusion.", fix: "Скажите уверенно, без словесной подготовки.", rewrite: "" },
  { id: "ru-t-ne-sekret-chto", category: "throat-clearing", severity: 1, kind: "phrase", match: "не секрет, что", desc: "'Не секрет, что' — 'it's no secret that', claiming a shared truth before stating it.", fix: "Сформулируйте факт.", rewrite: "" },

  // ------------------------------------------------------------------
  // summary-recap
  // ------------------------------------------------------------------
  { id: "ru-s-v-zaklyuchenie", category: "summary-recap", severity: 2, kind: "phrase", match: "в заключение", desc: "'В заключение хочется сказать…' — the formal recap opener.", fix: "Закончите последним конкретным пунктом.", rewrite: "" },
  { id: "ru-s-podvodya-itog", category: "summary-recap", severity: 2, kind: "phrase", match: "подводя итог", desc: "'Подводя итог, можно сказать…' — restates the piece inside the piece.", fix: "Уберите пересказ.", rewrite: "" },
  { id: "ru-s-rezyumiruyu", category: "summary-recap", severity: 2, kind: "phrase", match: "резюмируя", desc: "'Резюмируя вышесказанное' — a recap signpost with no new content.", fix: "Скажите вывод напрямую.", rewrite: "" },

  // ------------------------------------------------------------------
  // weasel-attribution
  // ------------------------------------------------------------------
  { id: "ru-wz-eksperty-schitayut", category: "weasel-attribution", severity: 3, kind: "phrase", match: "эксперты считают", desc: "'Эксперты считают' — an invisible college that agrees whenever asked.", fix: "Назовите конкретного эксперта или уберите.", rewrite: "" },
  { id: "ru-wz-issledovaniya-pokazyvayut", category: "weasel-attribution", severity: 3, kind: "regex", flags: "giu", match: "исследовани[яйе]? (?:показывают|доказывают)", desc: "'Исследования показывают' — citation by plural, no paper attached.", fix: "Сошлитесь на конкретное исследование.", rewrite: "" },

  // ------------------------------------------------------------------
  // business-jargon
  // ------------------------------------------------------------------
  { id: "ru-b-tsifrovaya-transformatsiya", category: "business-jargon", severity: 2, kind: "phrase", match: "цифровая трансформация", desc: "'Цифровая трансформация' — the packaged phrase for any modernization claim.", fix: "Назовите, что именно меняется.", rewrite: "" },
  { id: "ru-b-kompleksnoe-reshenie", category: "business-jargon", severity: 2, kind: "phrase", match: "комплексное решение", desc: "'Комплексное решение' — a comprehensive-solution claim that names nothing.", fix: "Опишите само решение.", rewrite: "" },
  { id: "ru-b-peredovye-tekhnologii", category: "business-jargon", severity: 2, kind: "phrase", match: "передовые технологии", desc: "'Передовые технологии' — frontier status by phrase rather than by measurement.", fix: "Назовите конкретную технологию и результат.", rewrite: "" },
  { id: "ru-b-optimizatsiya-protsessov", category: "business-jargon", severity: 1, kind: "phrase", match: "оптимизация процессов", desc: "'Оптимизация процессов' — consultants' wallpaper; nothing is said to be faster or cheaper.", fix: "Опишите, какой процесс ускоряется и как.", rewrite: "" },
  { id: "ru-b-era-tsifrovizatsii", category: "business-jargon", severity: 2, kind: "phrase", match: "эпоху цифровизации", desc: "'В эпоху цифровизации' — epoch-name inflation for a routine state of affairs.", fix: "Уберите эпоху, начните с факта.", rewrite: "" },
  { id: "ru-b-igraet-vazhnuyu-rol", category: "business-jargon", severity: 2, kind: "phrase", match: "играет важную роль", desc: "'Играет важную роль' — 'plays a vital role'; the model's importance default.", fix: "Назовите эффект этой роли.", rewrite: "" },

  // ------------------------------------------------------------------
  // ru-copy-tics — a NEW category appended by this file
  // ------------------------------------------------------------------
  { id: "ru-c-na-segodnyashniy-den", category: "ru-copy-tics", severity: 1, kind: "phrase", match: "на сегодняшний день", desc: "'На сегодняшний день' — 'as of today'; a status marker models add to sound current.", fix: "Скажите, что справедливо сейчас, или назовите дату.", rewrite: "" },
  { id: "ru-c-vydayushchiysya", category: "ru-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "выдающ(?:ийся|аяся|ееся|иеся)", desc: "'Выдающийся' — the superlative filler for anything above average.", fix: "Покажите, чем именно результат выдаётся.", rewrite: "" },
  { id: "ru-c-bezuslovno", category: "ru-copy-tics", severity: 1, kind: "phrase", match: "безусловно", desc: "'Безусловно' — 'undoubtedly'; assurance performed instead of argued.", fix: "Скажите факт и аргумент.", rewrite: "" },
  { id: "ru-c-nesomnenno", category: "ru-copy-tics", severity: 1, kind: "phrase", match: "несомненно", desc: "'Несомненно' — sibling of 'безусловно'.", fix: "Скажите факт и аргумент.", rewrite: "" },
  { id: "ru-c-revolyutsionnye-izmeneniya", category: "ru-copy-tics", severity: 3, kind: "phrase", match: "революционные изменения", desc: "'Революционные изменения' — the grandest claim in the vocabulary, applied to ordinary upgrades.", fix: "Опишите реальное изменение.", rewrite: "" },
];

return {
  version: "1.0.0-ru",
  categories: CATEGORIES,
  patterns: PATTERNS,
};
});