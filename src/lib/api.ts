import type { CopilotRequest, CopilotTurn, ReviewRequestMessage, SectionId } from "./types";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `request failed (${res.status})`);
  return data as T;
}

export async function askCopilot(req: CopilotRequest): Promise<CopilotTurn> {
  const { turn } = await post<{ turn: CopilotTurn }>("/api/copilot", req);
  return turn;
}

export interface PolishedSentence {
  section: SectionId;
  sourceId: string;
  original: string;
  polished: string;
}

export async function polishReview(messages: ReviewRequestMessage[]): Promise<PolishedSentence[]> {
  const { sentences } = await post<{ sentences: PolishedSentence[] }>("/api/review", { messages });
  return sentences;
}
