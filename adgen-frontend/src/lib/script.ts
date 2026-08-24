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

// Scripts are usually PASTED, and people paste from Docs/Notion/ChatGPT — so the
// line rarely starts with the keyword. `### Scene 1 — Hook`, `**Scene 1**`, `- VO:`
// and `> NARRATOR:` all read as scripts to a human and all missed the old anchors
// (which required the keyword at column 0). LEAD covers that ornamentation.
const LEAD = String.raw`^[\s>#*_\-–—•\d.)\]]*`;

const MARKERS: RegExp[] = [
  new RegExp(`${LEAD}(vo|v\\.o\\.|voice ?over|narrator|narration|script)\\s*[:\\-—]`, "im"),
  // SCENE 1: / ### Scene 1 — Hook / **Shot 2 -** ... also allows a trailing title
  new RegExp(`${LEAD}(scene|shot|frame|beat|sequence)\\s*\\d+\\s*[:\\-—.|]`, "im"),
  /^\s*\d{1,2}\s*[:.]\s*\d{2}\s*[-–—]/m, // 00:04 – timecodes
  /\b\d{1,3}\s*[-–—]\s*\d{1,3}\s*(sec|s|seconds)\b/i, // "0–6 sec" beat ranges
  /\b(end ?frame|end ?card|fade (in|out)|cut to|title card|super:)\b/i,
  new RegExp(`${LEAD}(tagline|cta|call to action|logo|dialogue|visual|on-?screen)\\s*[:\\-—]`, "im"),
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

// ---------------------------------------------------------------------------
// Quality-preset suggestion — reads the SAME "what is this text for" question
// as scriptSignals above, but answers "how much render budget does it deserve"
// instead of "is it finished copy". A quick draft and a client deliverable read
// very differently even in one sentence, and the render preset is exactly the
// knob that should track that difference. This only SUGGESTS (surfaced next to
// the quality toggle, one click to apply) — it never silently overrides the
// user's own choice; "ask, never assume" applies to render spend too.
const DRAFT_MARKERS = [
  /\b(test|quick|draft|rough|sample|scratch|throwaway|just (testing|trying|checking)|iterat\w*|prototype)\b/i,
  /(टेस्ट|ड्राफ्ट|जल्दी|आजमा)/, // test / draft / quick / try — common Hinglish chat forms
];
const FINAL_MARKERS = [
  /\b(final|client|deliver(y|able)?|ship it|publish|production|premium|polish(ed)?|best quality|master|for the demo|presentation)\b/i,
  /(फाइनल|क्लाइंट|डिलीवर)/, // final / client / deliver
];

export type QualitySuggestion = { preset: "preview" | "master"; reason: string } | null;

/** A one-line reason to suggest Preview (fast) or Master (best) — or null when the
 * text carries no clear signal either way (the common case; say nothing then). */
export function suggestQuality(text: string): QualitySuggestion {
  const t = (text || "").trim();
  if (t.length < 6) return null;
  const draft = DRAFT_MARKERS.some((re) => re.test(t));
  const final = FINAL_MARKERS.some((re) => re.test(t));
  if (final && !draft) return { preset: "master", reason: "sounds like a final deliverable" };
  if (draft && !final) return { preset: "preview", reason: "sounds like a quick test" };
  return null; // both or neither fired — ambiguous, stay quiet rather than guess
}
