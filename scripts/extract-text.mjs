// Extracts per-page text from a PDF with pdfjs-dist (the same library the app uses).
// Usage: node scripts/extract-text.mjs samples/paper.pdf [--json out.json]
import { readFile, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const [path, flag, out] = process.argv.slice(2);
const data = new Uint8Array(await readFile(path));
const pdf = await getDocument({ data, verbosity: 0 }).promise;
const pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const content = await (await pdf.getPage(i)).getTextContent();
  pages.push(
    content.items
      .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : ""))
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
}
console.log(`pages: ${pdf.numPages}`);
pages.forEach((p, i) => console.log(`page ${i + 1}: ${p.length} chars | ${p.slice(0, 90).replace(/\n/g, " ")}`));
if (flag === "--json" && out) {
  await writeFile(out, JSON.stringify(pages));
  console.log(`wrote ${out}`);
}
