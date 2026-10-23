/** Joins pdf.js text-content items into page text (same logic as scripts/extract-text.mjs). */
export function itemsToText(items: ReadonlyArray<object>): string {
  return items
    .map((it) => ("str" in it ? (it as { str: string }).str + ((it as { hasEOL?: boolean }).hasEOL ? "\n" : "") : ""))
    .join("")
    .replace(/[ \t]+/g, " ")
    .trim();
}
