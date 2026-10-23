# Decisions

One line per judgment call made while building overnight.

- Scaffolded with create-next-app@latest, which installed Next.js 16.4 (Turbopack, Cache Components on) and react-pdf 11 / pdfjs-dist 6; kept them.
- Sample paper: BERT (arXiv 1810.04805, NAACL 2019 / ACL Anthology N19-1423), saved to samples/ and copied to public/samples/ for a one-click "Use sample paper" demo.
- DeepSeek called with plain fetch (no SDK) and `response_format: json_object`; the first probe returned malformed JSON (`{"ok":💥}`), so every call is parsed loosely, schema-validated, and retried up to 3 times with the error fed back.
- The API reports model "deepseek-chat" as aliased server-side (response said "deepseek-flash"); we still request "deepseek-chat" as specified.
- The whole paper text (per page, capped at 150k chars) is sent in the system message on every call; there is no server cache, and an identical prefix lets DeepSeek's prefix cache kick in.
- Citations are verified server-side against the extracted text (normalized: NFKC, lowercase, letters/digits only); a wrong page number is silently fixed when the quote is found on another page; unverified quotes or banned phrases trigger one regeneration.
- Added a short list of banned phrases (notably, importantly, crucial, "good point", ...) checked in code as a guardrail on top of the prompt.
- The reviewer's scores and first impression are never sent to the LLM, so the copilot cannot anchor on them.
- Walkthrough and "Your take" are two separate LLM calls (keeps the one-turn JSON format from the spec); the question loads right after the walkthrough appears.
- "Next part" advances to the next review-form section (no sub-steps inside a section).
- Fonts: Source Serif 4 (copilot text, review) + Source Sans 3 (UI chrome) via next/font; palette is warm paper neutrals with one oxblood accent (#8c3b2a); light theme only (journal look).
- Card labels instead of chat bubbles: "This part says", "Your take", "You wrote", "From the paper", "A factual check", "That call is yours". Older blocks fade so only the latest exchange is in focus.
- The PDF column is 60% during discussion, 55% on the review page (the review needs a bit more width).
- After upload, the PDF is already visible on the left while the initial score form sits in the card, so the reviewer can read before scoring.
- The first walkthrough is prefetched while the reviewer fills in the initial score; it is not shown until they submit.
- The first-impression turn is filtered out of the history sent to the copilot (found in testing: the copilot quoted it back).
- pdf.js worker, standard fonts and cMaps are copied into public/pdfjs on install/dev/build (scripts/copy-pdf-assets.mjs) instead of relying on bundler `new URL(..., import.meta.url)`; they are git-ignored.
- PDF pages are memoized with stable props: any state change otherwise re-rendered the text layer and wiped the reviewer's selection.
- Highlights are drawn as an overlay of rects (stored as fractions of the page box) computed from a DOM Range over the text layer, rather than by editing text-layer spans; they survive resizes.
- Fallback order for a citation: exact normalized match on the cited page → fuzzy (head/tail anchors, then longest matching word run) → same on neighbouring pages, then all pages → scroll to the cited page with "(page only)" shown next to the quote.
- "Ask about this" attaches the selection to the composer instead of sending immediately, so the reviewer can type a question; sending it empty asks for a walkthrough of the passage.
- "Show source" cycles through the latest cited turn's quotes; clicking any quote in the card jumps to it.
- "Simpler" restates the latest copilot turn of the section; "Define a term" opens a small inline input.
- "Next part" is allowed even if the reviewer wrote nothing for a section (the review then says "Nothing recorded for this part").
- The final score form does not show the initial score while choosing, to avoid anchoring; both are shown on the review page.
- The review uses only discussion replies (not the first impression). Messages that are only questions, or that the copilot answered as a factual question or declined as a verdict request, are left out.
- AI edits are computed by a deterministic word diff (original vs polished), not by asking the model to mark them, so every change is shown.
- A polish that changes more than 50% of words (80% for fragments under 8 words) is discarded and the original kept; a model "original" span that can't be found in the message is dropped, and any message left uncovered is added verbatim.
- Once the reviewer hand-edits a sentence, its AI marks are dropped and it is shown as their text (export keeps original, AI polish and final).
- The review provenance popover's "Refers to" passage: the reviewer's selection if any, else the first quote of the copilot's reply to that message, else the most recent cited passage before it.
- Export is triggered client-side (Blob download) and available at any phase.
- Study mode (added later): no "Skip" link. With study mode off the before step is skipped entirely, and with it on the step is required, so a Skip link could never appear (confirmed with the user).
- The study-mode toggle is also shown at the top right of the start screen: the app's top bar only exists after upload, and the toggle must be set before upload to affect the before step.
- The toggle locks once the walkthrough starts (a before score can't be collected after AI content). Switching it off while on the before step skips straight to the walkthrough.
- The final score step is kept in both modes. Without study mode, the export holds only `scores.final` (no first impression, no comparison), and the review header shows a single score.
- Without study mode the walkthrough starts right after upload; the card shows "Opening the paper…" until text extraction finishes.
