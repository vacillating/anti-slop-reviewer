"use client";

import { useEffect, useRef, useState } from "react";
import type { LocateStatus } from "./PdfViewer";
import type { Turn, TurnType } from "@/lib/types";

const LABELS: Partial<Record<TurnType, string>> = {
  walkthrough: "This part says",
  question: "Your take",
  answer: "From the paper",
  fact_correction: "A factual check",
  decline: "That call is yours",
  reviewer_reply: "You wrote",
  selection_question: "You asked about a passage",
  define_request: "You asked for a definition",
  simplify_request: "You asked for simpler wording",
};

interface Props {
  sectionLabel: string;
  turns: Turn[];
  /** When set, the card shows a past exchange instead of the live discussion. */
  past: boolean;
  onBackToCurrent(): void;
  pending: string | null;
  error: string | null;
  onRetry(): void;
  focusTurnId: string | null;
  locations: Record<string, LocateStatus[]>;
  onCitationClick(turnId: string, index: number): void;
  attachedSelection: { page: number; text: string } | null;
  onClearSelection(): void;
  onSend(text: string): void;
  onShowSource(): void;
  onSimpler(): void;
  onDefine(term: string): void;
  onNext(): void;
  nextLabel: string;
  canShowSource: boolean;
  canSimplify: boolean;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

function TurnBlock({
  turn,
  dim,
  statuses,
  onCitationClick,
}: {
  turn: Turn;
  dim: boolean;
  statuses?: LocateStatus[];
  onCitationClick(i: number): void;
}) {
  const reviewer = turn.speaker === "reviewer";
  return (
    <section className={`fade-up transition-opacity duration-300 ${dim ? "opacity-45 hover:opacity-90" : ""}`}>
      <p className={`label mb-2 ${turn.type === "fact_correction" && !dim ? "!text-accent" : ""}`}>
        {LABELS[turn.type] ?? turn.type}
      </p>
      {turn.selection && (
        <p className="mb-2 border-l-2 border-mark-strong pl-3 font-serif text-sm italic leading-relaxed text-ink-soft">
          p. {turn.selection.page} · “{truncate(turn.selection.text, 220)}”
        </p>
      )}
      {reviewer ? (
        <p className="whitespace-pre-wrap border-l border-hairline pl-3 text-[15px] leading-relaxed text-ink-soft">
          {turn.text}
        </p>
      ) : (
        <p
          className={`whitespace-pre-wrap font-serif leading-[1.65] text-ink ${
            turn.type === "question" ? "text-[18px] italic" : "text-[17px]"
          }`}
        >
          {turn.text}
        </p>
      )}
      {turn.citations.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {turn.citations.map((c, i) => (
            <li key={i}>
              <button
                onClick={() => onCitationClick(i)}
                className="group flex w-full gap-2 text-left font-serif text-[13.5px] leading-snug text-ink-soft"
              >
                <span className="shrink-0 pt-px font-sans text-[11px] tabular-nums tracking-wide text-muted group-hover:text-accent">
                  p.&nbsp;{c.page}
                </span>
                <span className="italic decoration-mark-strong decoration-2 underline-offset-2 group-hover:underline">
                  “{c.quote}”
                  {statuses?.[i] === "page" && <span className="ml-1 not-italic text-muted">(page only)</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DiscussionCard(props: Props) {
  const { turns, past, pending, error, attachedSelection } = props;
  const [draft, setDraft] = useState("");
  const [defining, setDefining] = useState(false);
  const [term, setTerm] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Keep the newest exchange in view.
  useEffect(() => {
    const el = scroller.current;
    if (el && !past) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length, pending, past]);

  useEffect(() => {
    if (attachedSelection) textarea.current?.focus();
  }, [attachedSelection]);

  // Everything before the latest reviewer message is quieted, so one exchange stays in focus.
  const lastReviewerIdx = turns.map((t) => t.speaker).lastIndexOf("reviewer");
  const busy = pending !== null;

  const send = () => {
    const text = draft.trim();
    if (busy || (!text && !attachedSelection)) return;
    props.onSend(text);
    setDraft("");
  };

  const submitTerm = () => {
    const t = term.trim();
    if (!t || busy) return;
    props.onDefine(t);
    setTerm("");
    setDefining(false);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline justify-between border-b border-hairline-soft px-8 pb-4 pt-6">
        <h2 className="font-serif text-[22px] text-ink">{props.sectionLabel}</h2>
        {past && (
          <button onClick={props.onBackToCurrent} className="text-sm text-accent hover:underline">
            ← Back to the current part
          </button>
        )}
      </header>

      <div ref={scroller} className="quiet-scroll flex-1 space-y-7 overflow-y-auto px-8 py-6">
        {past && <p className="text-xs text-muted">An earlier exchange, linked from the margin marker.</p>}
        {turns.map((t, i) => (
          <TurnBlock
            key={t.id}
            turn={t}
            dim={!past && i < lastReviewerIdx && t.id !== props.focusTurnId}
            statuses={props.locations[t.id]}
            onCitationClick={(ci) => props.onCitationClick(t.id, ci)}
          />
        ))}
        {pending && (
          <p className="fade-up font-serif text-[15px] italic text-muted">
            {pending}
            <span className="ml-1 inline-block animate-pulse">…</span>
          </p>
        )}
        {error && (
          <p className="text-sm text-accent">
            The copilot could not respond ({truncate(error, 140)}).{" "}
            <button onClick={props.onRetry} className="underline underline-offset-2">
              Try again
            </button>
          </p>
        )}
      </div>

      {!past && (
        <footer className="border-t border-hairline-soft px-8 pb-6 pt-4">
          {attachedSelection && (
            <div className="mb-3 flex items-start gap-2 rounded-sm bg-paper px-3 py-2">
              <p className="flex-1 font-serif text-[13.5px] italic leading-snug text-ink-soft">
                <span className="mr-1 font-sans text-[11px] not-italic text-muted">p. {attachedSelection.page}</span>“
                {truncate(attachedSelection.text, 160)}”
              </p>
              <button onClick={props.onClearSelection} className="text-muted hover:text-ink" aria-label="Remove passage">
                ×
              </button>
            </div>
          )}
          <textarea
            ref={textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder={
              attachedSelection
                ? "What would you like to know about this passage? (Enter sends; empty asks for a walkthrough)"
                : "Your take, in your own words. Or ask a factual question about the paper."
            }
            className="w-full resize-none border-b border-hairline bg-transparent pb-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-muted/70 focus:border-accent"
          />

          {defining && (
            <div className="fade-up mt-3 flex items-center gap-2">
              <input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitTerm();
                  if (e.key === "Escape") setDefining(false);
                }}
                placeholder="Term to define, e.g. masked language model"
                className="flex-1 border-b border-hairline bg-transparent py-1 text-sm outline-none focus:border-accent"
              />
              <button onClick={submitTerm} className="text-sm text-accent hover:underline">
                Define
              </button>
            </div>
          )}

          <div className="mt-4 flex items-center gap-1 text-[13px]">
            <CardButton onClick={props.onShowSource} disabled={!props.canShowSource}>
              Show source
            </CardButton>
            <CardButton onClick={props.onSimpler} disabled={!props.canSimplify || busy}>
              Simpler
            </CardButton>
            <CardButton onClick={() => setDefining((d) => !d)} disabled={busy}>
              Define a term
            </CardButton>
            <span className="flex-1" />
            <button
              onClick={send}
              disabled={busy || (!draft.trim() && !attachedSelection)}
              className="mr-2 px-2 py-1.5 text-ink-soft hover:text-ink disabled:opacity-30"
            >
              Send
            </button>
            <button
              onClick={props.onNext}
              disabled={busy}
              className="rounded-sm bg-ink px-3.5 py-1.5 font-medium text-paper hover:bg-accent disabled:opacity-30"
            >
              {props.nextLabel}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function CardButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="rounded-sm border border-hairline-soft px-2.5 py-1.5 text-ink-soft transition-colors hover:border-hairline hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
