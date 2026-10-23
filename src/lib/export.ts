import { segmentsText } from "./diff";
import type { ReviewDraft, Turn } from "./types";

export interface SessionSnapshot {
  paperName: string;
  numPages: number;
  startedAt: string;
  initialScore: number | null;
  firstImpression: string;
  finalScore: number | null;
  turns: Turn[];
  review: ReviewDraft | null;
}

/** Builds the export JSON: every turn, both scores, and the review with AI edits marked. */
export function buildExport(s: SessionSnapshot) {
  return {
    app: "Review Copilot",
    version: 1,
    exportedAt: new Date().toISOString(),
    paper: { name: s.paperName, numPages: s.numPages },
    startedAt: s.startedAt,
    scores: {
      scale: "1-5, half points",
      initial: s.initialScore,
      final: s.finalScore,
    },
    firstImpression: s.firstImpression,
    turns: s.turns.map((t) => ({
      id: t.id,
      speaker: t.speaker,
      type: t.type,
      section: t.section,
      text: t.text,
      citations: t.citations,
      selection: t.selection,
      timestamp: t.timestamp,
    })),
    review: s.review && {
      generatedAt: s.review.generatedAt,
      sentences: s.review.sentences.map((r) => ({
        section: r.section,
        sourceTurnId: r.sourceTurnId,
        original: r.original,
        aiPolished: r.polished,
        final: r.userText ?? segmentsText(r.segments),
        editedByReviewer: r.userText !== undefined,
        aiEdits: r.segments
          .filter((g) => g.kind === "ai")
          .map((g) => g.kind === "ai" && { original: g.original, polished: g.polished, reverted: g.reverted }),
        citation: r.citation ?? null,
      })),
    },
  };
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
