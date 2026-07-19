// Telling a finished SCRIPT apart from a rough IDEA.
//
// Every surface that talks to the planner ("the brain") needs this same judgement,
// because the two deserve opposite treatment: an idea is a prompt to be developed,
// a script is finished work that must survive untouched. Getting it wrong in the
// rewriting direction is the expensive one — it silently discards copy the user
// already wrote and approved.
//
// Length alone is a bad signal: a long rambling brief is still an idea, and a tight
// 30-word VO is still a script. So we look for the SHAPE of a script instead.

const MARKERS: RegExp[] = [
  /^\s*(vo|v\.o\.|voice ?over|narrator|narration|script)\s*[:\-—]/im, // VO: / NARRATOR:
  /^\s*(scene|shot|frame|beat)\s*\d+\s*[:\-—.]/im, // SCENE 1: / Shot 2 -
  /^\s*\d{1,2}\s*[:.]\s*\d{2}\s*[-–—]/m, // 00:04 – timecodes
  /\b(end ?frame|end ?card|fade (in|out)|cut to|title card|super:)\b/i,
  /^\s*(tagline|cta|call to action|logo)\s*[:\-—]/im,
  /\b(on-?screen text|supers?)\s*[:\-—]/i,
  /"[^"]{25,}"/, // a long quoted spoken line
  /[“][^”]{25,}[”]/,
];

/** Reasons the text reads as a script — empty means it reads as an idea. */
export function scriptSignals(text: string): string[] {
  const t = (text || "").trim();
  if (!t) return [];
  const hits: string[] = [];
  if (MARKERS.some((re) => re.test(t))) hits.push("script formatting");

  const words = t.split(/\s+/).filter(Boolean).length;
  const sentences = (t.match(/[.!?।]+/g) || []).length;
  // Finished copy is many full sentences; a brief is usually one or two.
  if (words >= 60 && sentences >= 4) hits.push("written out in full sentences");
  // Paragraphed prose (a real script has beats on their own lines).
  if (t.split(/\n\s*\n/).length >= 3 && words >= 60) hits.push("multiple paragraphs");
  return hits;
}

/** True when the text is finished copy rather than a brief to develop. */
export function looksLikeScript(text: string): boolean {
  return scriptSignals(text).length > 0;
}

// Mirrors llm.spoken_seconds so the UI can show the same number the planner sizes to.
const WORDS_PER_SEC: Record<string, number> = { hi: 2.1, en: 2.6 };

/** Rough spoken length, +0.35s of breathing per sentence break. */
export function spokenSeconds(script: string, language = "en"): number {
  const words = (script || "").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  const rate = WORDS_PER_SEC[(language || "en").slice(0, 2)] ?? 2.4;
  const breaths = 0.35 * Math.max(0, ((script.match(/[.!?।]+/g) || []).length - 1));
  return Math.round((words / rate + breaths) * 10) / 10;
}
