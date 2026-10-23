# Status (overnight build)

## What works (tested end to end in Chrome with the sample BERT paper)

- `npm run build` passes (clean `.next`), `npm run lint` is clean, and `npm run dev` starts without errors.
- Upload a PDF or use the bundled sample → initial score (1–5, half points) + first impression, before any AI content.
- All five sections run the loop: walkthrough with highlighted sources → open question → reviewer reply.
  Observed in the UI: factual question → "answer" with quote; wrong fact ("only Wikipedia") → "fact_correction" quoting
  BooksCorpus + Wikipedia; "Is this good enough to accept?" → "decline" + open question; opinions → open follow-up.
- Show source / Simpler / Define a term / Next part; quote clicks jump to the passage.
- PDF: real rendering with text and annotation layers; smooth scroll to the cited passage with a soft yellow highlight;
  margin markers for every cited turn, and clicking one shows that past exchange in the card.
- Selecting text in the PDF shows "Ask about this"; the selection goes to the copilot as context.
- Final score → review page: grouped by section, reviewer's words with grammar fixes only, each changed word marked and
  revertible with one click, hover shows the source message and the paper passage, and inline editing works.
- Export session JSON: all turns (speaker, type, section, text, citations, timestamps), both scores, first impression,
  review sentences with `original`, `aiPolished`, `final`, `aiEdits[]` (with `reverted`), `citation`.
- API checks:
  - `npm run test:api`: 11/11 valid JSON turns across every action; 30/30 quotes verified against the paper text
    (25/25 in an earlier run).
  - `npm run test:retry`: malformed JSON → invalid type → success on attempt 3.
  - DeepSeek really did return malformed JSON once (`{"ok":💥}`) during setup, so the retry path matters.
- Text extraction: `npm run extract-text -- samples/bert-1810.04805.pdf` → 16 pages, ~4k chars each.

## What doesn't / not done

- No mobile or narrow layout; designed for a laptop screen (≥ 1280px wide).
- Only tested in Chrome. Safari/Firefox are untested.
- "Ask about this" was verified with a scripted selection + mouseup in Chrome; the automation's synthetic mouse drag did
  not create a text selection, so **please try one real mouse selection before the demo**.
- No streaming: each copilot turn appears after ~2–4 s with a quiet "Reading the paper…" line.
- No persistence: reload = new session (export first).
- Papers over ~150k characters of text are truncated for the LLM (later pages are omitted).
- Scanned (image-only) PDFs: no text layer, so no citations or highlights; a warning is shown on the score screen.

## Known issues

- Quotes keep the PDF's line-break hyphenation as extracted (e.g. "to-kens", "sys-tems") in the card. Highlighting is
  unaffected because matching ignores punctuation.
- Highlight reliability: every cited quote highlighted in the manual run, and server-side verification passes ~100% on
  BERT. Other PDFs (unusual fonts, ligatures, two-column reading order) may fall back to fuzzy or "page only"; the flow
  never blocks.
- The copilot sometimes ends a section with a mildly closed wrap-up ("Is there anything else you want to record…?") or
  a soft "what would you weigh most heavily". Tune in `prompts/copilot.ts`.
- The review polish can still pick a different connective; it is always marked and revertible, and the prompt now
  forbids adding but/however/because.
- Reverting a polish edit restores the whole changed run (e.g. "convincing," → "convinsing"), which can drop a comma the
  AI added next to it.
- The review hover popover can cover the following lines while it is open.
- Dev only: Turbopack's on-disk cache once served a stale `globals.css`. If styles look wrong, `rm -rf .next` and restart.

## Demo tips

- `npm run dev`, open http://localhost:3000, then click "Or use the sample paper".
- Good beats to show: a deliberate factual error ("BERT-large has 12 layers"), "Should I accept this?",
  selecting a sentence → Ask about this, clicking a margin marker, and on the review page reverting a marked word, then Export.
