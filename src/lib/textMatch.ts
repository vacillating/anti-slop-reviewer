// Quote matching shared by the server (citation verification) and the client
// (highlighting in the PDF text layer).
//
// Matching works on a "normalized" form of the text: NFKC (splits ligatures like
// "ﬁ"), lowercased, letters and digits only. Dropping spaces and punctuation makes
// line-break hyphenation ("down-\nstream"), odd spacing between text-layer spans,
// and curly vs straight quotes irrelevant.

const KEEP = /[\p{L}\p{N}]/u;

/** Normalizes one source character; may return 0..n chars (ligatures expand). */
function normChar(ch: string): string {
  let out = "";
  for (const c of ch.normalize("NFKC").toLowerCase()) {
    if (KEEP.test(c)) out += c;
  }
  return out;
}

export function normalize(text: string): string {
  let out = "";
  for (const ch of text) out += normChar(ch);
  return out;
}

/**
 * Normalizes `text` and returns, for every normalized char, the index of the
 * source char it came from (so a match can be mapped back to the original).
 */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const n = normChar(ch);
    for (let k = 0; k < n.length; k++) map.push(i);
    norm += n;
    i += ch.length;
  }
  return { norm, map };
}

export interface MatchRange {
  /** Start and end (exclusive) in the normalized haystack. */
  start: number;
  end: number;
  quality: "exact" | "fuzzy";
}

function words(quote: string): string[] {
  return quote
    .split(/\s+/)
    .map(normalize)
    .filter((w) => w.length > 0);
}

/**
 * Finds `quote` in a normalized haystack. Tries an exact match first, then a
 * fuzzy match anchored on the quote's first and last words, then the longest
 * run of words that does match.
 */
export function findQuote(haystackNorm: string, quote: string): MatchRange | null {
  const q = normalize(quote);
  if (q.length < 4) return null;

  const exact = haystackNorm.indexOf(q);
  if (exact >= 0) return { start: exact, end: exact + q.length, quality: "exact" };

  const w = words(quote);
  if (w.length < 3) return null;

  // Anchor on the head and tail of the quote; accept if the span is plausible.
  for (const k of [5, 4, 3]) {
    if (w.length < k + 1) continue;
    const head = w.slice(0, k).join("");
    const tail = w.slice(-k).join("");
    const hs = haystackNorm.indexOf(head);
    if (hs < 0) continue;
    const ts = haystackNorm.indexOf(tail, hs);
    if (ts < 0) continue;
    const end = ts + tail.length;
    if (end - hs <= q.length * 1.6 + 20) return { start: hs, end, quality: "fuzzy" };
  }

  // Longest run of consecutive quote words that appears in the haystack.
  let best: MatchRange | null = null;
  const minWords = Math.min(4, w.length);
  for (let i = 0; i < w.length; i++) {
    for (let j = w.length; j >= i + minWords; j--) {
      const chunk = w.slice(i, j).join("");
      if (chunk.length < 12) break;
      const at = haystackNorm.indexOf(chunk);
      if (at >= 0) {
        if (!best || chunk.length > best.end - best.start) {
          best = { start: at, end: at + chunk.length, quality: "fuzzy" };
        }
        break;
      }
    }
  }
  return best;
}

/**
 * Checks a citation against per-page paper text. Returns the page the quote was
 * actually found on (preferring the cited page), or null if not found.
 */
export function locateCitation(
  pagesNorm: string[],
  page: number,
  quote: string,
): { page: number; quality: "exact" | "fuzzy" } | null {
  const order = [page - 1, ...pagesNorm.map((_, i) => i).filter((i) => i !== page - 1)];
  // Exact pass over all pages first, then fuzzy, so an exact hit elsewhere wins
  // over a fuzzy hit on the cited page.
  for (const quality of ["exact", "fuzzy"] as const) {
    for (const i of order) {
      const hay = pagesNorm[i];
      if (hay === undefined) continue;
      const m = findQuote(hay, quote);
      if (m && (quality === "fuzzy" || m.quality === "exact")) return { page: i + 1, quality: m.quality };
    }
  }
  return null;
}
