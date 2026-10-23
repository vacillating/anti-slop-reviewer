import { NextResponse } from "next/server";
import { chatJson } from "@/lib/llm";
import { changeRatio } from "@/lib/diff";
import type { ReviewRequestMessage, SectionId } from "@/lib/types";
import { REVIEW_POLISH_PROMPT } from "../../../../prompts/copilot";

const SECTION_IDS: SectionId[] = ["summary", "soundness", "novelty", "clarity", "overall"];

/** Above this share of changed words, the polish is discarded and the original kept (looser for short fragments). */
const MAX_CHANGE_RATIO = 0.5;

interface PolishedSentence {
  section: SectionId;
  sourceId: string;
  original: string;
  polished: string;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function validate(value: unknown): PolishedSentence[] {
  const v = value as { sentences?: unknown };
  if (!v || !Array.isArray(v.sentences)) throw new Error(`expected { "sentences": [...] }`);
  return v.sentences.map((s, i) => {
    const x = s as Record<string, unknown>;
    for (const k of ["sourceId", "original", "polished"]) {
      if (typeof x?.[k] !== "string") throw new Error(`sentences[${i}].${k} must be a string`);
    }
    if (!SECTION_IDS.includes(x.section as SectionId)) throw new Error(`sentences[${i}].section is invalid`);
    return x as unknown as PolishedSentence;
  });
}

export async function POST(request: Request) {
  let messages: ReviewRequestMessage[];
  try {
    ({ messages } = await request.json());
    if (!Array.isArray(messages)) throw new Error();
  } catch {
    return NextResponse.json({ error: "body must be { messages: [...] }" }, { status: 400 });
  }
  const byId = new Map(messages.map((m) => [m.id, m]));

  const notes = SECTION_IDS.map((section) => {
    const items = messages.filter((m) => m.section === section);
    const lines = items.map(
      (m) =>
        `- id=${m.id}${m.copilotResponseType === "answer" ? " (the copilot treated this as a factual question)" : ""}: ${JSON.stringify(m.text)}`,
    );
    return `## ${section}\n${lines.length ? lines.join("\n") : "(no messages)"}`;
  }).join("\n\n");

  try {
    const { value } = await chatJson(
      [
        { role: "system", content: REVIEW_POLISH_PROMPT },
        { role: "user", content: `Reviewer messages by section:\n\n${notes}` },
      ],
      validate,
      { temperature: 0.1 },
    );

    const out: PolishedSentence[] = [];
    for (const s of value) {
      const msg = byId.get(s.sourceId);
      if (!msg) continue;
      let original = squash(s.original);
      let polished = squash(s.polished);
      // The "original" must really be the reviewer's words; otherwise keep the message as written.
      if (!squash(msg.text).includes(original) || !original) {
        original = squash(msg.text);
        polished = original;
      }
      const limit = original.split(" ").length < 8 ? 0.8 : MAX_CHANGE_RATIO;
      if (changeRatio(original, polished) > limit) polished = original;
      out.push({ section: msg.section, sourceId: msg.id, original, polished });
    }

    // Never drop a reviewer statement silently: add uncovered ones verbatim.
    for (const m of messages) {
      const covered = out.some((s) => s.sourceId === m.id);
      if (!covered && m.copilotResponseType !== "answer" && m.text.trim()) {
        const text = squash(m.text);
        out.push({ section: m.section, sourceId: m.id, original: text, polished: text });
      }
    }

    // Keep the reviewer's order inside each section.
    const order = new Map(messages.map((m, i) => [m.id, i]));
    out.sort(
      (a, b) =>
        SECTION_IDS.indexOf(a.section) - SECTION_IDS.indexOf(b.section) ||
        (order.get(a.sourceId) ?? 0) - (order.get(b.sourceId) ?? 0),
    );
    return NextResponse.json({ sentences: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[review]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
