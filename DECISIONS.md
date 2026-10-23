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
