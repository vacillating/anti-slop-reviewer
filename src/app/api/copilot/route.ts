import { NextResponse } from "next/server";
import { chatJson, type ChatMessage } from "@/lib/llm";
import { locateCitation, normalize } from "@/lib/textMatch";
import type { Citation, CopilotRequest, CopilotTurn, CopilotTurnType } from "@/lib/types";
import {
  BANNED_PHRASES,
  COPILOT_SYSTEM_PROMPT,
  buildActionInstruction,
  buildPaperContext,
} from "../../../../prompts/copilot";

const TURN_TYPES: CopilotTurnType[] = ["walkthrough", "question", "answer", "fact_correction", "decline"];

/** The type each action must produce; "respond" lets the model choose. */
const EXPECTED_TYPE: Partial<Record<CopilotRequest["action"], CopilotTurnType>> = {
  walkthrough: "walkthrough",
  question: "question",
  define: "answer",
};

function validateTurn(value: unknown): CopilotTurn {
  if (!value || typeof value !== "object") throw new Error("output is not an object");
  const v = value as Record<string, unknown>;
  if (!TURN_TYPES.includes(v.type as CopilotTurnType)) throw new Error(`invalid "type": ${String(v.type)}`);
  if (typeof v.text !== "string" || !v.text.trim()) throw new Error(`"text" must be a non-empty string`);
  if (!Array.isArray(v.citations)) throw new Error(`"citations" must be an array`);
  const citations: Citation[] = v.citations.map((c, i) => {
    const cc = c as Record<string, unknown>;
    const page = typeof cc?.page === "string" ? parseInt(cc.page, 10) : cc?.page;
    if (typeof page !== "number" || !Number.isFinite(page)) throw new Error(`citations[${i}].page must be a number`);
    if (typeof cc.quote !== "string" || !cc.quote.trim()) throw new Error(`citations[${i}].quote must be a string`);
    return { page, quote: cc.quote.trim() };
  });
  return { type: v.type as CopilotTurnType, text: v.text.trim(), citations };
}

/** Checks quotes against the paper; fixes page numbers when the quote is elsewhere. */
function verifyCitations(citations: Citation[], pagesNorm: string[]): Citation[] {
  return citations
    .filter((c) => c.page >= 1 && c.page <= pagesNorm.length)
    .map((c) => {
      const found = locateCitation(pagesNorm, c.page, c.quote);
      return found ? { ...c, page: found.page, verified: true } : { ...c, verified: false };
    });
}

function problems(turn: CopilotTurn): string[] {
  const out: string[] = [];
  const unverified = turn.citations.filter((c) => !c.verified);
  if (unverified.length > 0) {
    out.push(
      `these quotes do not appear in the paper text; copy quotes exactly from the page text: ${unverified
        .map((c) => JSON.stringify(c.quote))
        .join(", ")}`,
    );
  }
  const lower = turn.text.toLowerCase();
  const banned = BANNED_PHRASES.filter((p) => lower.includes(p));
  if (banned.length > 0) out.push(`do not use these phrases: ${banned.join(", ")}`);
  return out;
}

export async function POST(request: Request) {
  let body: CopilotRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.pages) || body.pages.length === 0) {
    return NextResponse.json({ error: "pages (paper text per page) is required" }, { status: 400 });
  }
  body.history = Array.isArray(body.history) ? body.history : [];

  const pagesNorm = body.pages.map(normalize);
  const messages: ChatMessage[] = [
    { role: "system", content: `${COPILOT_SYSTEM_PROMPT}\n\n${buildPaperContext(body.pages)}` },
    { role: "user", content: buildActionInstruction(body) },
  ];

  try {
    let { value: turn, attempts } = await chatJson(messages, validateTurn);
    turn.citations = verifyCitations(turn.citations, pagesNorm);

    // One regeneration if quotes don't match the paper or banned phrasing slipped in.
    const issues = problems(turn);
    if (issues.length > 0) {
      try {
        const retry = await chatJson(
          [
            ...messages,
            { role: "assistant", content: JSON.stringify(turn) },
            { role: "user", content: `Revise your turn: ${issues.join("; ")}. Return the full JSON again.` },
          ],
          validateTurn,
        );
        retry.value.citations = verifyCitations(retry.value.citations, pagesNorm);
        if (problems(retry.value).length <= issues.length) turn = retry.value;
        attempts += retry.attempts;
      } catch (err) {
        console.warn("[copilot] revision failed, keeping first turn", err);
      }
    }

    const expected = EXPECTED_TYPE[body.action];
    if (expected) turn.type = expected;
    return NextResponse.json({ turn, attempts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[copilot]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
