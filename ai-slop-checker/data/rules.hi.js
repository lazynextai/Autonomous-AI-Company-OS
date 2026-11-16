"use strict";
/**
 * Lazynext AI Slop Checker — Hindi sample rules (data/rules.hi.js).
 *
 * An ORIGINAL, Lazynext-written sample of Hindi AI-slop tells, shipped on
 * the same external-rules extension path as data/rules.ru.js. Consumed with
 *
 *   node api/cli.js --rules data/rules.hi.js "आज के डिजिटल युग में..."
 *
 * Hindi model-generated copy reaches for its own dialect of the same tells:
 * borrowed English business words written in Devanagari
 * ("लेवरेज", "सीमलेस"), epoch openers ("आज के दौर में", "आज के डिजिटल
 * युग में"), throat-clearing ("यह बात ध्यान देने योग्य है", "कोई आश्चर्य
 * नहीं कि"), hedge phrases ("शायद", "ने कहा जा सकता है"), and generic
 * superlatives ("अद्वितीय", "शानदार", "क्रांतिकारी"). Every description
 * and fix was written by Lazynext from knowledge of Hindi copy conventions,
 * not copied from any source repository.
 *
 * Pattern format matches data/slop-patterns.js. Categories reuse the base
 * ids where the tell belongs (filler-phrases, word-ban, throat-clearing,
 * summary-recap, weasel-attribution, business-jargon) and APPEND one new
 * category (hi-copy-tics) per the "new categories appended" merge rule.
 *
 * Hindi avoids \b (ASCII-only); single-word tells use kind "regex" with
 * Unicode-aware boundaries and the "u" flag.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    window.SlopPatternsHi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {

const CATEGORIES = [
  {
    id: "hi-copy-tics",
    name: "Hindi copy tics",
    desc: "The factory vocabulary of Hindi AI-generated copy: loanword English buzzwords in Devanagari and assurance words that pad a claim.",
  },
];

const PATTERNS = [
  // ------------------------------------------------------------------
  // filler-phrases — epoch openers, Hindi edition
  // ------------------------------------------------------------------
  { id: "hi-f-aaj-ke-daur-mein", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "आज के (?:दौर|समय|युग) में", desc: "'आज के दौर में' — the epoch-inflation opener ('in today's era'); whichever topic follows is never actually an era.", fix: "विशिष्ट संदर्भ से शुरू करें — 'युग' के बयान के बिना।", rewrite: "" },
  { id: "hi-f-digital-yug", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "डिजिटल युग", desc: "'डिजिटल युग में' — the digital-age preamble, Hindi edition.", fix: "बिना 'युग' के सीधे मुद्दे पर आएँ।", rewrite: "" },
  { id: "hi-f-badalti-duniya", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "(?:इस )?बदलती (?:दुनिया|तकनीक)", desc: "'बदलती दुनिया में' — the fast-changing-world opener in Hindi.", fix: "कौन-सा परिवर्तन, यह बताएँ।", rewrite: "" },
  { id: "hi-f-yeh-baat-dhyan", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "(?:यह|ये) बात (?:ध्यान|गौर) देने योग्य है", desc: "'यह बात ध्यान देने योग्य है' — 'it is worth noting'; announces significance before delivering it.", fix: "सीधे तथ्य कहें।", rewrite: "" },
  { id: "hi-f-gour-tolniya", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "गौरतलब है कि", desc: "'गौरतलब है कि' — the throat-clearing 'it is noteworthy that' in Hindi copy.", fix: "उल्लेख के बिना ही बात कही जाए।", rewrite: "" },
  { id: "hi-f-koi-ashcharya-nahi", category: "filler-phrases", severity: 2, kind: "regex", flags: "giu", match: "(?:कोई|क्या) आश्चर्य नहीं", desc: "'कोई आश्चर्य नहीं कि' — 'no surprise that', claims a shared reaction.", fix: "बिना प्रस्तावना के निष्कर्ष कहें।", rewrite: "" },

  // ------------------------------------------------------------------
  // word-ban — loanword buzzwords in Devanagari (Unicode-aware)
  // ------------------------------------------------------------------
  { id: "hi-w-leverage", category: "word-ban", severity: 3, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])लेवरेज(?![\\p{L}\\p{N}])", desc: "'लेवरेज' — loanword 'leverage'; models write the English word in Devanagari instead of a Hindi verb.", fix: "हिंदी क्रिया से बदलें — 'उपयोग', 'भुनाना', या सटीक क्रिया।", rewrite: "" },
  { id: "hi-w-optimize", category: "word-ban", severity: 3, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])ऑप्टिमाइज़(?![\\p{L}\\p{N}])", desc: "'ऑप्टिमाइज़ करें' — loanword 'optimize', a promise without a measurement.", fix: "बताएँ कि कौन-सी प्रक्रिया कैसे तेज़/सस्ती होगी।", rewrite: "" },
  { id: "hi-w-seamless", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])सीमलेस(?![\\p{L}\\p{N}])", desc: "'सीमलेस अनुभव' — the loanword 'seamless', a friction claim with no evidence.", fix: "बताएँ कि किस चरण में क्या आसान हुआ।", rewrite: "" },
  { id: "hi-w-unique", category: "word-ban", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])अद्वितीय(?![\\p{L}\\p{N}])", desc: "'अद्वितीय' — 'unique'; the strongest downloadable adjective, applied to everything.", fix: "वास्तविक अंतर बताएँ।", rewrite: "" },
  { id: "hi-w-shandar", category: "word-ban", severity: 1, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])शानदार(?![\\p{L}\\p{N}])", desc: "'शानदार' — generic superlative praise without a shown result.", fix: "मापने योग्य परिणाम या ठोस गुण बताएँ।", rewrite: "" },
  { id: "hi-w-krantikari", category: "word-ban", severity: 3, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])क्रांतिकारी(?![\\p{L}\\p{N}])", desc: "'क्रांतिकारी' — 'revolutionary', the grandest claim in the vocabulary, applied to ordinary upgrades.", fix: "वास्तविक परिवर्तन का वर्णन करें।", rewrite: "" },

  // ------------------------------------------------------------------
  // throat-clearing
  // ------------------------------------------------------------------
  { id: "hi-t-is-lekh-mein", category: "throat-clearing", severity: 2, kind: "regex", flags: "giu", match: "इस लेख में (?:हम |आप )?", desc: "'इस लेख में हम देखेंगे…' — metacommentary about the article inside the article.", fix: "विचार से शुरू करें; पाठक पहले से लेख में है।", rewrite: "" },
  { id: "hi-t-dhyan-dein", category: "throat-clearing", severity: 1, kind: "regex", flags: "giu", match: "कृपया (?:यहाँ |इस पर )?ध्यान दें", desc: "'ध्यान दें…' — directs the reader by command instead of by content.", fix: "सार को टेक्स्ट से ही स्पष्ट करें।", rewrite: "" },
  { id: "hi-t-viswas-ke-sath", category: "throat-clearing", severity: 2, kind: "regex", flags: "giu", match: "पूरे विश्वास के साथ", desc: "'निश्चित रूप से कहा जा सकता है' — false assurance that pre-argues the conclusion.", fix: "विश्वास शब्दों से नहीं, तथ्यों से बने।", rewrite: "" },
  { id: "hi-t-koi-rahashya-nahi", category: "throat-clearing", severity: 1, kind: "regex", flags: "giu", match: "यह (?:कोई )?रहस्य नहीं", desc: "'यह कोई रहस्य नहीं कि' — 'it's no secret that', claiming a shared truth before stating it.", fix: "तथ्य सीधे कहें।", rewrite: "" },

  // ------------------------------------------------------------------
  // summary-recap
  // ------------------------------------------------------------------
  { id: "hi-s-ant-mein", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "अंत में (?:हम |मैं )?यही कहना", desc: "'अंत में कह सकते हैं…' — the formal recap opener in Hindi.", fix: "सबसे ठोस बिंदु पर समाप्त करें।", rewrite: "" },
  { id: "hi-s-saransh", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "संक्षेप में कहें तो", desc: "'संक्षेप में कहें तो' — restates the piece inside the piece.", fix: "पुनर्कथन हटाएँ।", rewrite: "" },
  { id: "hi-s-upkarsh", category: "summary-recap", severity: 2, kind: "regex", flags: "giu", match: "उपसंहार (?:के रूप में|में)", desc: "'उपसंहार के रूप में' — the summary-recap signpost with no new content.", fix: "निष्कर्ष सीधे बताएँ।", rewrite: "" },

  // ------------------------------------------------------------------
  // weasel-attribution
  // ------------------------------------------------------------------
  { id: "hi-wz-vishweshagjog", category: "weasel-attribution", severity: 3, kind: "regex", flags: "giu", match: "विशेषज्ञों का कहना है", desc: "'विशेषज्ञों का कहना है' — an invisible college that agrees whenever asked.", fix: "किसी वास्तविक विशेषज्ञ का नाम लें या हटाएँ।", rewrite: "" },
  { id: "hi-wz-anusandhan", category: "weasel-attribution", severity: 3, kind: "regex", flags: "giu", match: "शोध से (?:पता चलता|साबित)", desc: "'शोध से पता चलता है' — citation by plural, no paper attached.", fix: "किसी विशेष शोध का संदर्भ दें।", rewrite: "" },

  // ------------------------------------------------------------------
  // business-jargon
  // ------------------------------------------------------------------
  { id: "hi-b-digital-transform", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "डिजिटल परिवर्तन", desc: "'डिजिटल परिवर्तन' — the packaged phrase for any modernization claim.", fix: "बताएँ कि वास्तव में क्या बदलता है।", rewrite: "" },
  { id: "hi-b-end-to-end", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "एंड-टू-एंड", desc: "'एंड-टू-एंड सॉल्यूशन' — the comprehensive-solution claim that names nothing.", fix: "समाधान का वर्णन करें।", rewrite: "" },
  { id: "hi-b-synergy", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "सिनर्जी", desc: "'सिनर्जी' — the all-time business buzzword in Devanagari; models reach for it in any collaboration paragraph.", fix: "बताएँ कि साथ काम करने से क्या नया प्रभाव उभरता है।", rewrite: "" },
  { id: "hi-b-mahattva", category: "business-jargon", severity: 2, kind: "regex", flags: "giu", match: "महत्वपूर्ण भूमिका निभाता", desc: "'महत्वपूर्ण भूमिका निभाता है' — 'plays a vital role'; importance by phrase, not by effect.", fix: "इस भूमिका का परिणाम बताएँ।", rewrite: "" },

  // ------------------------------------------------------------------
  // hi-copy-tics — a NEW category appended by this file
  // ------------------------------------------------------------------
  { id: "hi-c-aaj-ke-samay", category: "hi-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "आज के समय में", desc: "'आज के समय में' — a status marker models add to sound current.", fix: "बताएँ कि अभी क्या सच है, या तारीख़ दें।", rewrite: "" },
  { id: "hi-c-pehle-se-behtar", category: "hi-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "पहले से (?:बेहतर|बेहतरीन)", desc: "'पहले से बेहतर' — a comparison with no baseline.", fix: "किस आधार पर बेहतर, यह बताएँ।", rewrite: "" },
  { id: "hi-c-bohat-zaroori", category: "hi-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "बहुत (?:महत्वपूर्ण|ज़रूरी) है", desc: "'यह बहुत ज़रूरी है' — importance announced instead of shown.", fix: "महत्व को सामग्री से सिद्ध करें।", rewrite: "" },
  { id: "hi-c-ein-umber", category: "hi-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "(?<![\\p{L}\\p{N}])अनुपम(?![\\p{L}\\p{N}])", desc: "'अनुपम अनुभव' — an unspellable superlative for any experience.", fix: "अनुभव का ठोस वर्णन करें।", rewrite: "" },
  { id: "hi-c-aapki-badhiya", category: "hi-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "आपकी (?:अच्छी|बढ़िया) (?:समझ|सफलता) के लिए", desc: "'आपकी सफलता के लिए' — the empty good-luck blessing models append to close.", fix: "विषय के आधार पर सार्थक समाप्ति करें।", rewrite: "" },
  { id: "hi-c-kya-kaha-jaye", category: "hi-copy-tics", severity: 2, kind: "regex", flags: "giu", match: "क्या कहा जाए", desc: "'क्या कहा जाए' — a rhetorical hesitation that pads without adding.", fix: "सीधे कहें।", rewrite: "" },
  { id: "hi-c-shuruaat-karein", category: "hi-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "हम शुरुआत करते हैं", desc: "'आइए, हम शुरुआत करते हैं' — the 'let's begin' transition in Hindi.", fix: "अगले भाग पर चले जाएँ।", rewrite: "" },
  { id: "hi-c-ek-bat-spasht", category: "hi-copy-tics", severity: 1, kind: "regex", flags: "giu", match: "एक बात स्पष्ट", desc: "'एक बात स्पष्ट कर दूँ' — pre-announces clarity instead of being clear.", fix: "स्पष्टता से लिखें।", rewrite: "" },
];

return {
  version: "1.0.0-hi",
  categories: CATEGORIES,
  patterns: PATTERNS,
};
});