import type { Segment } from "./types";

/** Splits text into word tokens that keep their trailing whitespace. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/**
 * Word-level diff between the reviewer's original text and the AI-polished text.
 * Runs of unchanged words become "same" segments; every changed run becomes one
 * "ai" segment holding both versions, so it can be marked and reverted.
 */
export function diffWords(original: string, polished: string): Segment[] {
  const a = tokenize(original);
  const b = tokenize(polished);
  const ka = a.map((t) => t.trim());
  const kb = b.map((t) => t.trim());

  // LCS table, filled from the end.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = ka[i] === kb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const segments: Segment[] = [];
  let del = "";
  let ins = "";
  const flush = () => {
    if (del || ins) segments.push({ kind: "ai", original: del, polished: ins, reverted: false });
    del = "";
    ins = "";
  };
  const pushSame = (text: string) => {
    flush();
    const last = segments[segments.length - 1];
    if (last?.kind === "same") last.text += text;
    else segments.push({ kind: "same", text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ka[i] === kb[j]) {
      pushSame(b[j]);
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      ins += b[j++];
    } else {
      del += a[i++];
    }
  }
  flush();

  // Keep whitespace outside of marked edits so marks hug the changed words only.
  for (let k = 0; k < segments.length; k++) {
    const s = segments[k];
    if (s.kind !== "ai") continue;
    const trail = s.polished.match(/\s*$/)?.[0] ?? "";
    const origTrail = s.original.match(/\s*$/)?.[0] ?? "";
    if (trail && s.polished.trim()) {
      s.polished = s.polished.slice(0, -trail.length);
      s.original = s.original.slice(0, s.original.length - origTrail.length);
      segments.splice(k + 1, 0, { kind: "same", text: trail });
      k++;
    }
  }
  return segments;
}

/** Fraction of the original's words that the polish changed (0 = untouched). */
export function changeRatio(original: string, polished: string): number {
  const total = tokenize(original).length || 1;
  const changed = diffWords(original, polished)
    .filter((s) => s.kind === "ai")
    .reduce((n, s) => n + Math.max(tokenize((s as { original: string }).original).length, 1), 0);
  return changed / total;
}

/** Renders the current text of a sentence's segments. */
export function segmentsText(segments: Segment[]): string {
  return segments.map((s) => (s.kind === "same" ? s.text : s.reverted ? s.original : s.polished)).join("");
}
