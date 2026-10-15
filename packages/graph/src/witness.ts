/**
 * Strict source grammars (no NLP). Used at seed time AND re-applied at read time to the verified
 * excerpt text, so stored witness properties are never trusted on their own.
 */
const CUE_ENTRY = /^Cue (\d+): "([^"\n]+)"$/;
const CUE_ENTRY_LINES = /^Cue (\d+): "([^"\n]+)"$/gm;
const CUE_CUT = /^Cut: (v(\d+)\b[^\n]*)$/gm;
const CUE_COUNT = /^END OF CUE SHEET\. Complete listing: (\d+) cues?\.$/gm;
const LICENSE_SUBJECT = /^Composition: "([^"\n]+)"$/;
const SCOPE_CUT = /\bCut v(\d+)\b/g;
const QUOTED = /"([^"\n]+)"/g;

export interface CueSheet {
  cutVersion: number | null;
  /** Display label taken from the file's own cut line, e.g. "Cut v4 (current distribution cut)". */
  cutLabel: string | null;
  declaredCueCount: number | null;
  entries: { index: number; title: string }[];
  complete: boolean;
}

/**
 * Whole-file cue-sheet grammar. complete=true only when the file names exactly one cut, declares a
 * count, and lists exactly that many consecutively numbered, uniquely titled cues.
 */
export function parseCueSheet(text: string): CueSheet {
  const cuts = [...text.matchAll(CUE_CUT)];
  const counts = [...text.matchAll(CUE_COUNT)].map(m => Number(m[1]));
  const entries = [...text.matchAll(CUE_ENTRY_LINES)].map(m => ({ index: Number(m[1]), title: String(m[2]) }));
  const cut = cuts.length === 1 ? cuts[0]! : null;
  const cutVersion = cut ? Number(cut[2]) : null;
  const declaredCueCount = counts.length === 1 ? counts[0]! : null;
  const consecutive = entries.every((e, i) => e.index === i + 1);
  const unique = new Set(entries.map(e => e.title)).size === entries.length;
  const complete = cutVersion !== null && declaredCueCount !== null && declaredCueCount > 0
    && declaredCueCount === entries.length && consecutive && unique;
  return { cutVersion, cutLabel: cut ? `Cut ${cut[1]}` : null, declaredCueCount, entries, complete };
}

/** `Cue N: "Title"` exactly, or null. */
export function cueEntryOf(excerpt: string): { index: number; title: string } | null {
  const m = CUE_ENTRY.exec(excerpt);
  return m ? { index: Number(m[1]), title: String(m[2]) } : null;
}

/** `Composition: "Title"` exactly, or null. */
export function subjectOf(excerpt: string): string | null {
  const m = LICENSE_SUBJECT.exec(excerpt);
  return m ? String(m[1]) : null;
}

/** Exactly one `Cut vN` and at most one quoted title, or null. */
export function scopeOf(excerpt: string): { cutVersion: number; title: string | null } | null {
  const cuts = [...excerpt.matchAll(SCOPE_CUT)].map(m => Number(m[1]));
  const titles = [...excerpt.matchAll(QUOTED)].map(m => String(m[1]));
  if (cuts.length !== 1 || titles.length > 1) return null;
  return { cutVersion: cuts[0]!, title: titles[0] ?? null };
}
