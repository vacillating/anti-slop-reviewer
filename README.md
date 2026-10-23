# Review Copilot

A demo of an AI copilot that helps a senior peer reviewer read a paper **without the AI ever giving its own opinion**.
The copilot walks through the paper section by section, answers factual questions with exact quotes (which are
highlighted in the real PDF), corrects only factual misreadings, and asks open questions. At the end it assembles a
review from the reviewer's **own words**, marking every word it changed.

## Setup

Requirements: Node.js 20+ and a DeepSeek API key.

```bash
npm install                 # also copies the pdf.js worker/fonts into public/pdfjs
echo "DEEPSEEK_API_KEY=sk-..." > .env.local   # skip if .env.local already exists
npm run dev                 # http://localhost:3000
```

Production build: `npm run build && npm start`.

Click **"Or use the sample paper"** on the start screen to try it with BERT (arXiv 1810.04805) without uploading.

## The flow

1. **Start**: upload a PDF (or use the sample). By default the walkthrough starts right away.
   With **Study mode** on (small toggle at the top right, off by default; it can only be changed before the
   walkthrough starts), the reviewer must first record an overall score (1–5, half points) and a one-line first
   impression, before any AI content. Neither is ever sent to the LLM.
2. **Discussion**, for each review-form section (Summary · Soundness · Novelty · Clarity · Overall):
   - *This part says*: a plain-language walkthrough in the paper's order; cited passages are highlighted in the PDF.
   - *Your take*: one open question.
   - The reviewer replies in their own words or asks factual questions. Factual questions get an answer with a quote.
     A factual misreading gets the quote plus a neutral explanation. A verdict request is declined and turned into an
     open question.
   - Buttons: **Show source** (cycles through the cited passages), **Simpler**, **Define a term**, **Next part**.
   - Select text in the PDF to get an **Ask about this** button.
   - Each discussed passage leaves a small mark in the page margin. Click it to see that exchange again.
3. **Final score** on the same scale (in study mode, both scores are recorded).
4. **Review**: the reviewer's messages, grammar-fixed only, grouped by section. Changed words are underlined in the
   accent color; click one to restore the original wording. Hover a sentence to see the message it came from and the
   paper passage it refers to; double-click (or "Edit sentence") to edit it.
5. **Export session** (top right, any time): a JSON file with every turn (speaker, type, section, text, citations,
   timestamps), the final score, and the review with every AI edit listed. In study mode it also has the first
   impression and the before/after comparison (`scores.initial`, `scores.final`, `scores.change`).

## Where things live

| Path | What |
| --- | --- |
| `prompts/copilot.ts` | **All prompt text**: the copilot system prompt, per-section focus, per-action instructions, banned phrases, review polish prompt. Iterate here. |
| `src/app/api/copilot/route.ts` | Copilot endpoint: builds the prompt, validates the JSON turn, verifies quotes against the paper, regenerates once on bad quotes or banned phrasing. |
| `src/app/api/review/route.ts` | Review endpoint: light copy-editing of the reviewer's messages, with guards (original span must be in the message, too much rewording is rejected). |
| `src/lib/llm.ts` | DeepSeek client (server-only): loose JSON parsing plus validation and retry (3 attempts). |
| `src/lib/textMatch.ts` | Quote matching (normalized exact match, then fuzzy) used by both server verification and PDF highlighting. |
| `src/lib/diff.ts` | Word diff that produces the revertible "AI edit" marks. |
| `src/components/PdfViewer.tsx` | react-pdf viewer with text layer, highlight overlay, margin markers, "Ask about this". |
| `src/components/ReviewCopilot.tsx` | Session state and flow (in memory only). |

The LLM is DeepSeek (`deepseek-chat`, OpenAI-compatible API at `https://api.deepseek.com`), called only from the
server routes. The API key never reaches the browser.

## Scripts

```bash
npm run extract-text -- samples/bert-1810.04805.pdf   # check pdf.js text extraction on a PDF
npm run test:api -- http://localhost:3000             # smoke-test /api/copilot (dev server must be running)
npm run test:retry                                     # unit-test the malformed-JSON retry path (no network)
```

## Notes

- No database. Session state lives in the browser tab; reload = new session. Use Export to keep it.
- If styles look stale after pulling changes in dev, delete `.next/` (the Turbopack cache) and restart.
- See `STATUS.md` for what works and known issues, and `DECISIONS.md` for judgment calls.
