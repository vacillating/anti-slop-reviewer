"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PdfViewer, { type LocateStatus, type Marker, type PdfViewerHandle } from "./PdfViewer";
import DiscussionCard from "./DiscussionCard";
import ProgressBar from "./ProgressBar";
import ReviewPanel from "./ReviewPanel";
import ScoreForm from "./ScoreForm";
import StartScreen from "./StartScreen";
import StudyToggle from "./StudyToggle";
import { askCopilot, polishReview } from "@/lib/api";
import { diffWords } from "@/lib/diff";
import { buildExport, downloadJson } from "@/lib/export";
import { SECTIONS, sectionLabel } from "@/lib/sections";
import type {
  Citation,
  CopilotRequest,
  CopilotTurn,
  ReviewDraft,
  ReviewRequestMessage,
  ReviewSentence,
  SectionId,
  Turn,
} from "@/lib/types";

type Phase = "start" | "initial" | "discuss" | "final" | "review";

let idCounter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** A short quote (≤ 25 words) from a reviewer's selection, used as the review sentence's citation. */
function selectionCitation(sel: { page: number; text: string }): Citation {
  const words = sel.text.split(/\s+/);
  return { page: sel.page, quote: words.slice(0, 25).join(" ") };
}

export default function ReviewCopilot() {
  const [phase, setPhase] = useState<Phase>("start");
  // Study mode: the before-score step is required and the export carries the before/after comparison.
  // Off (default): the before step is skipped entirely.
  const [studyMode, setStudyMode] = useState(false);
  const [file, setFile] = useState<File | string | null>(null);
  const [paperName, setPaperName] = useState("");
  const [pages, setPages] = useState<string[] | null>(null);
  const [startedAt] = useState(() => new Date().toISOString());

  const [initialScore, setInitialScore] = useState<number | null>(null);
  const [firstImpression, setFirstImpression] = useState("");
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const turnsRef = useRef<Turn[]>([]);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [finished, setFinished] = useState<Set<SectionId>>(new Set());

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<(() => void) | null>(null);

  const [viewingTurnId, setViewingTurnId] = useState<string | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [locations, setLocations] = useState<Record<string, LocateStatus[]>>({});
  const [focus, setFocus] = useState<{ turnId: string; index: number } | null>(null);
  const [attachedSelection, setAttachedSelection] = useState<{ page: number; text: string } | null>(null);

  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const viewer = useRef<PdfViewerHandle>(null);
  const prefetch = useRef<Promise<CopilotTurn> | null>(null);
  const walkthroughStarted = useRef(false);

  const section = SECTIONS[sectionIdx].id;
  const turnsById = useMemo(() => new Map(turns.map((t) => [t.id, t])), [turns]);

  const addTurn = useCallback((t: Omit<Turn, "id" | "timestamp">): Turn => {
    const turn: Turn = { ...t, id: newId(t.speaker === "copilot" ? "c" : "r"), timestamp: new Date().toISOString() };
    turnsRef.current = [...turnsRef.current, turn];
    setTurns(turnsRef.current);
    return turn;
  }, []);

  // The first impression stays out of the copilot's context so it cannot anchor on it.
  const history = () =>
    turnsRef.current
      .filter((t) => t.type !== "initial_impression")
      .map(({ speaker, type, section, text }) => ({ speaker, type, section, text }));

  /** Calls the copilot; on failure shows the error in the card with a retry. */
  const call = useCallback(
    async (
      req: Omit<CopilotRequest, "pages" | "history">,
      pendingText: string,
      retry: () => void,
      shared?: Promise<CopilotTurn> | null,
    ): Promise<CopilotTurn | null> => {
      if (!pages) return null;
      setPending(pendingText);
      setError(null);
      try {
        return await (shared ?? askCopilot({ ...req, pages, history: history() }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        retryRef.current = retry;
        return null;
      } finally {
        setPending(null);
      }
    },
    [pages],
  );

  /** Highlights a copilot turn's citations in the PDF and records margin markers. */
  const highlightTurn = useCallback(async (turn: Turn, index = 0) => {
    if (!viewer.current || turn.citations.length === 0) return;
    setFocus({ turnId: turn.id, index });
    const locs = await viewer.current.showCitations(turn.citations, index);
    setLocations((prev) => ({ ...prev, [turn.id]: locs.map((l) => l.status) }));
    const label = `${sectionLabel(turn.section)} · ${turn.text.slice(0, 80)}…`;
    const placed = locs
      .filter((l) => l.status !== "none")
      .map((l) => ({ id: turn.id, page: l.page, topPct: l.status === "page" ? 0.02 : l.topPct, label }));
    setMarkers((prev) => [...prev.filter((m) => m.id !== turn.id), ...placed]);
  }, []);

  async function askQuestion(sec: SectionId) {
    const q = await call({ action: "question", section: sec }, "Thinking of a question for you", () => askQuestion(sec));
    if (q) addTurn({ speaker: "copilot", type: q.type, text: q.text, citations: q.citations, section: sec });
  }

  async function runWalkthrough(sec: SectionId) {
    const shared = sec === "summary" ? prefetch.current : null;
    prefetch.current = null;
    const w = await call(
      { action: "walkthrough", section: sec },
      `Reading the paper for the ${sectionLabel(sec)} part`,
      () => runWalkthrough(sec),
      shared,
    );
    if (!w) return;
    const turn = addTurn({ speaker: "copilot", type: w.type, text: w.text, citations: w.citations, section: sec });
    void highlightTurn(turn);
    await askQuestion(sec);
  }

  // Prefetch the first walkthrough while the reviewer records their initial score.
  // Scores and impressions are never sent to the copilot, so this cannot anchor it.
  useEffect(() => {
    if (phase === "initial" && pages && !prefetch.current) {
      prefetch.current = askCopilot({ action: "walkthrough", section: "summary", pages, history: [] });
      prefetch.current.catch(() => (prefetch.current = null));
    }
  }, [phase, pages]);

  // Start the first walkthrough once the discussion begins and the paper text is ready
  // (without study mode, the discussion begins right after upload, before extraction finishes).
  useEffect(() => {
    if (phase === "discuss" && pages && !walkthroughStarted.current) {
      walkthroughStarted.current = true;
      void runWalkthrough("summary");
    }
  });

  async function respondTo(
    req: Omit<CopilotRequest, "pages" | "history">,
    pendingText: string,
    typeOverride?: CopilotTurn["type"],
    fallbackCitations?: Citation[],
  ) {
    const r = await call(req, pendingText, () => respondTo(req, pendingText, typeOverride, fallbackCitations));
    if (!r) return;
    const turn = addTurn({
      speaker: "copilot",
      type: typeOverride ?? r.type,
      text: r.text,
      citations: r.citations.length ? r.citations : (fallbackCitations ?? []),
      section: req.section,
    });
    void highlightTurn(turn);
  }

  // ---- reviewer actions -------------------------------------------------------

  const handleFile = (f: File | string, name: string) => {
    setFile(f);
    setPaperName(name);
    setPhase(studyMode ? "initial" : "discuss");
  };

  const changeStudyMode = (on: boolean) => {
    setStudyMode(on);
    // Turning study mode off on the before step skips it.
    if (!on && phase === "initial") setPhase("discuss");
  };

  const handleText = useCallback((p: string[]) => setPages(p), []);

  const startDiscussion = (score: number, impression: string) => {
    setInitialScore(score);
    setFirstImpression(impression);
    addTurn({ speaker: "reviewer", type: "initial_impression", text: impression, citations: [], section: null });
    setPhase("discuss");
  };

  const sendReply = (raw: string) => {
    const sel = attachedSelection;
    const text = raw || "Walk me through this passage.";
    addTurn({
      speaker: "reviewer",
      type: sel ? "selection_question" : "reviewer_reply",
      text,
      citations: [],
      section,
      selection: sel ?? undefined,
    });
    setAttachedSelection(null);
    void respondTo({ action: "respond", section, userText: text, selection: sel ?? undefined }, "Looking in the paper");
  };

  const lastCopilotTurn = (withCitations = false) =>
    [...turnsRef.current]
      .reverse()
      .find((t) => t.speaker === "copilot" && t.section === section && (!withCitations || t.citations.length > 0));

  const simplify = () => {
    const target = lastCopilotTurn();
    if (!target) return;
    addTurn({ speaker: "reviewer", type: "simplify_request", text: "Simpler, please.", citations: [], section });
    void respondTo(
      { action: "simplify", section, target: target.text },
      "Putting that more plainly",
      target.type as CopilotTurn["type"],
      target.citations,
    );
  };

  const define = (term: string) => {
    addTurn({ speaker: "reviewer", type: "define_request", text: `Define “${term}”.`, citations: [], section });
    void respondTo({ action: "define", section, term }, `Looking up “${term}”`);
  };

  const showSource = () => {
    const target = lastCopilotTurn(true);
    if (!target) return;
    const index = focus?.turnId === target.id ? (focus.index + 1) % target.citations.length : 0;
    setViewingTurnId(null);
    void highlightTurn(target, index);
  };

  const next = () => {
    setFinished((f) => new Set(f).add(section));
    setViewingTurnId(null);
    setError(null);
    if (sectionIdx < SECTIONS.length - 1) {
      const nextSec = SECTIONS[sectionIdx + 1].id;
      setSectionIdx(sectionIdx + 1);
      if (!turnsRef.current.some((t) => t.section === nextSec && t.speaker === "copilot")) void runWalkthrough(nextSec);
    } else {
      viewer.current?.clearHighlights();
      setPhase("final");
    }
  };

  const onMarkerClick = (id: string) => {
    const t = turnsById.get(id);
    if (!t) return;
    setViewingTurnId(id);
    void highlightTurn(t);
  };

  // ---- review ------------------------------------------------------------------

  const citationFor = (turn: Turn): Citation | undefined => {
    if (turn.selection) return selectionCitation(turn.selection);
    const all = turnsRef.current;
    const i = all.findIndex((t) => t.id === turn.id);
    const reply = all.slice(i + 1).find((t) => t.speaker === "copilot");
    if (reply?.citations[0]) return reply.citations[0];
    return [...all.slice(0, i)].reverse().find((t) => t.speaker === "copilot" && t.citations.length > 0)?.citations[0];
  };

  const generateReview = async () => {
    setReviewLoading(true);
    setReviewError(null);
    const all = turnsRef.current;
    const messages: ReviewRequestMessage[] = all
      .filter((t) => t.speaker === "reviewer" && t.section && (t.type === "reviewer_reply" || t.type === "selection_question"))
      .map((t) => {
        const i = all.indexOf(t);
        const reply = all.slice(i + 1).find((x) => x.speaker === "copilot");
        return {
          id: t.id,
          section: t.section!,
          text: t.text,
          copilotResponseType: reply?.type as ReviewRequestMessage["copilotResponseType"],
        };
      });
    try {
      const polished = messages.length ? await polishReview(messages) : [];
      const sentences: ReviewSentence[] = polished.map((p) => {
        const src = all.find((t) => t.id === p.sourceId);
        return {
          id: newId("s"),
          section: p.section,
          sourceTurnId: p.sourceId,
          original: p.original,
          polished: p.polished,
          segments: diffWords(p.original, p.polished),
          citation: src ? citationFor(src) : undefined,
        };
      });
      setReview({ generatedAt: new Date().toISOString(), sentences });
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewLoading(false);
    }
  };

  const finishScores = (score: number) => {
    setFinalScore(score);
    setPhase("review");
    void generateReview();
  };

  const exportSession = () => {
    const data = buildExport({
      paperName,
      numPages: pages?.length ?? 0,
      startedAt,
      studyMode,
      initialScore,
      firstImpression,
      finalScore,
      turns: turnsRef.current,
      review,
    });
    const base = paperName.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "-") || "paper";
    downloadJson(`review-session-${base}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.json`, data);
  };

  // ---- render ------------------------------------------------------------------

  const studyToggle = (
    <StudyToggle on={studyMode} onChange={changeStudyMode} disabled={phase !== "start" && phase !== "initial"} />
  );

  if (phase === "start" || !file) return <StartScreen onFile={handleFile} topRight={studyToggle} />;

  const sectionTurns = turns.filter((t) => t.section === section && t.type !== "initial_impression");
  const pastTurns = (() => {
    if (!viewingTurnId) return null;
    const i = turns.findIndex((t) => t.id === viewingTurnId);
    if (i < 0) return null;
    const out = [turns[i]];
    if (turns[i - 1]?.speaker === "reviewer" && turns[i - 1].type !== "initial_impression") out.unshift(turns[i - 1]);
    if (turns[i].type === "walkthrough" && turns[i + 1]?.type === "question") out.push(turns[i + 1]);
    return out;
  })();
  const textLooksEmpty = pages !== null && pages.join("").trim().length < 200;
  const progressCurrent = phase === "discuss" ? section : null;
  const allDone = phase === "final" || phase === "review";

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline bg-paper px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-serif text-[17px] text-ink">Review Copilot</span>
          <span className="truncate text-xs text-muted">{paperName}</span>
        </div>
        <ProgressBar current={progressCurrent} finished={allDone ? new Set(SECTIONS.map((s) => s.id)) : finished} />
        <div className="flex items-center gap-4">
          {studyToggle}
          <button
            onClick={exportSession}
            className="rounded-sm border border-hairline px-3 py-1 text-[13px] text-ink-soft hover:border-muted hover:text-ink"
          >
            Export session
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 border-r border-hairline" style={{ width: phase === "review" ? "55%" : "60%" }}>
          <PdfViewer
            ref={viewer}
            file={file}
            onTextExtracted={handleText}
            markers={markers}
            activeMarkerId={viewingTurnId ?? focus?.turnId ?? null}
            onMarkerClick={onMarkerClick}
            onAskAbout={
              phase === "discuss"
                ? (sel) => {
                    setViewingTurnId(null);
                    setAttachedSelection(sel);
                  }
                : undefined
            }
          />
        </div>

        <aside className="min-w-0 flex-1 bg-sheet">
          {phase === "initial" && (
            <div className="quiet-scroll h-full overflow-y-auto px-10 py-10">
              <ScoreForm
                title="Before we begin"
                intro="Before the copilot says anything, record your own starting point. Read as much of the paper on the left as you like."
                withImpression
                submitLabel="Start the walkthrough"
                disabled={!pages}
                disabledNote="Reading the paper's text…"
                onSubmit={startDiscussion}
              />
              {textLooksEmpty && (
                <p className="mt-6 text-sm text-accent">
                  Very little text could be extracted from this PDF (it may be scanned). The copilot will not be able to cite it.
                </p>
              )}
            </div>
          )}

          {phase === "discuss" && (
            <DiscussionCard
              sectionLabel={pastTurns ? sectionLabel(turnsById.get(viewingTurnId!)?.section ?? null) : sectionLabel(section)}
              turns={pastTurns ?? sectionTurns}
              past={pastTurns !== null}
              onBackToCurrent={() => {
                setViewingTurnId(null);
                const t = lastCopilotTurn(true);
                if (t) void highlightTurn(t);
              }}
              pending={pending ?? (pages ? null : "Opening the paper")}
              error={error}
              onRetry={() => retryRef.current?.()}
              focusTurnId={focus?.turnId ?? null}
              locations={locations}
              onCitationClick={(id, i) => {
                const t = turnsById.get(id);
                if (t) void highlightTurn(t, i);
              }}
              attachedSelection={attachedSelection}
              onClearSelection={() => setAttachedSelection(null)}
              onSend={sendReply}
              onShowSource={showSource}
              onSimpler={simplify}
              onDefine={define}
              onNext={next}
              nextLabel={sectionIdx < SECTIONS.length - 1 ? "Next part →" : "Finish →"}
              canShowSource={sectionTurns.some((t) => t.speaker === "copilot" && t.citations.length > 0)}
              canSimplify={sectionTurns.some((t) => t.speaker === "copilot")}
            />
          )}

          {phase === "final" && (
            <div className="quiet-scroll h-full overflow-y-auto px-10 py-10">
              <ScoreForm
                title="Your final score"
                intro={
                  studyMode
                    ? "You have been through every part. Where do you land now? Use the same scale as before."
                    : "You have been through every part. Where do you land?"
                }
                submitLabel="Write up my review"
                onSubmit={finishScores}
              />
            </div>
          )}

          {phase === "review" && (
            <ReviewPanel
              sentences={review?.sentences ?? null}
              loading={reviewLoading}
              error={reviewError}
              onRetry={generateReview}
              initialScore={initialScore}
              finalScore={finalScore}
              turnsById={turnsById}
              onChange={(sentences) => setReview((r) => (r ? { ...r, sentences } : r))}
              onCitationClick={(c) => void viewer.current?.showCitations([c])}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
