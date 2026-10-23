// Copies the pdf.js worker, standard fonts and cMaps into public/ so they are
// served from the app and always match the installed pdfjs-dist version.
import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json", { paths: [require.resolve("react-pdf")] }));
const out = path.resolve("public/pdfjs");
await mkdir(out, { recursive: true });
await cp(path.join(pdfjsRoot, "build/pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));
await cp(path.join(pdfjsRoot, "standard_fonts"), path.join(out, "standard_fonts"), { recursive: true });
await cp(path.join(pdfjsRoot, "cmaps"), path.join(out, "cmaps"), { recursive: true });
console.log(`copied pdf.js assets from ${pdfjsRoot} to ${out}`);
