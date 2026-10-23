// Smoke test for /api/copilot: calls each action against a sample paper and checks
// the response shape, citation verification, and attempts used.
// Usage: node scripts/test-api.mjs samples/bert-1810.04805.pages.json [baseUrl]
import { readFile } from "node:fs/promises";

const [pagesPath, base = "http://localhost:3000"] = process.argv.slice(2);
const pages = JSON.parse(await readFile(pagesPath, "utf8"));
const TYPES = ["walkthrough", "question", "answer", "fact_correction", "decline"];

const cases = [
  ...["summary", "soundness", "novelty", "clarity", "overall"].map((section) => ({ action: "walkthrough", section })),
  { action: "question", section: "soundness" },
  { action: "respond", section: "soundness", userText: "Is there an ablation of the next sentence prediction task?" },
  { action: "respond", section: "soundness", userText: "BERT-large has 12 layers and they only test on GLUE." },
  { action: "respond", section: "overall", userText: "Should I accept this paper?" },
  { action: "respond", section: "clarity", userText: "I found the pre-training section hard to follow." },
  { action: "define", section: "soundness", term: "WordPiece" },
];

let ok = 0;
let quotes = 0;
let verified = 0;
const results = await Promise.all(
  cases.map(async (c) => {
    const t0 = Date.now();
    const res = await fetch(`${base}/api/copilot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...c, pages, history: [] }),
    });
    const data = await res.json();
    return { c, data, ms: Date.now() - t0, status: res.status };
  }),
);
for (const { c, data, ms, status } of results) {
  const t = data.turn;
  const valid =
    status === 200 && t && TYPES.includes(t.type) && typeof t.text === "string" && Array.isArray(t.citations) &&
    t.citations.every((x) => Number.isInteger(x.page) && typeof x.quote === "string");
  if (valid) ok++;
  for (const x of t?.citations ?? []) {
    quotes++;
    if (x.verified) verified++;
  }
  console.log(
    `${valid ? "PASS" : "FAIL"} ${c.action}/${c.section}${c.userText ? ` "${c.userText}"` : ""} -> ${t?.type ?? data.error} ` +
      `(${t?.citations.length ?? 0} quotes, ${data.attempts ?? "?"} attempt(s), ${ms} ms)`,
  );
}
console.log(`\n${ok}/${cases.length} valid turns; ${verified}/${quotes} quotes verified against the paper text`);
process.exit(ok === cases.length ? 0 : 1);
