"use client";

import { useRef, useState } from "react";
import { SECTIONS } from "@/lib/sections";
import { segmentsText } from "@/lib/diff";
import type { Citation, ReviewSentence, Turn } from "@/lib/types";

interface Props {
  sentences: ReviewSentence[] | null;
  loading: boolean;
  error: string | null;
  onRetry(): void;
  initialScore: number | null;
  finalScore: number | null;
  turnsById: Map<string, Turn>;
  onChange(sentences: ReviewSentence[]): void;
  onCitationClick(c: Citation): void;
}

interface Hover {
  id: string;
  top: number;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ReviewPanel(props: Props) {
  const { sentences } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (id: string, fn: (s: ReviewSentence) => ReviewSentence) =>
    sentences && props.onChange(sentences.map((s) => (s.id === id ? fn(s) : s)));

  const toggleSegment = (id: string, index: number) =>
    update(id, (s) => ({
      ...s,
      segments: s.segments.map((g, i) => (i === index && g.kind === "ai" ? { ...g, reverted: !g.reverted } : g)),
    }));

  const showHover = (id: string, el: HTMLElement) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const box = scroller.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setHover({ id, top: r.bottom - box.top + scroller.current!.scrollTop + 6 });
  };
  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), 220);
  };

  const saveEdit = () => {
    if (!editing) return;
    const text = editing.text.replace(/\s+/g, " ").trim();
    update(editing.id, (s) => (text && text !== segmentsText(s.segments) ? { ...s, userText: text } : s));
    setEditing(null);
  };

  const hovered = hover && sentences?.find((s) => s.id === hover.id);
  const source = hovered?.sourceTurnId ? props.turnsById.get(hovered.sourceTurnId) : undefined;
  const aiEditCount = sentences?.reduce((n, s) => n + (s.userText ? 0 : s.segments.filter((g) => g.kind === "ai" && !g.reverted).length), 0) ?? 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hairline-soft px-10 pb-4 pt-6">
        <h2 className="font-serif text-[22px] text-ink">Review</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Overall score: <span className="tabular-nums text-ink">{props.initialScore ?? "–"}</span> before the discussion,{" "}
          <span className="tabular-nums text-ink">{props.finalScore ?? "–"}</span> after.
        </p>
      </header>

      <div ref={scroller} className="quiet-scroll relative flex-1 overflow-y-auto px-10 py-6">
        {props.loading && (
          <p className="font-serif italic text-muted">
            Assembling your review from your own words<span className="ml-1 inline-block animate-pulse">…</span>
          </p>
        )}
        {props.error && (
          <p className="text-sm text-accent">
            Could not assemble the review ({props.error}).{" "}
            <button onClick={props.onRetry} className="underline underline-offset-2">
              Try again
            </button>
          </p>
        )}

        {sentences && (
          <>
            <p className="mb-8 border-l-2 border-accent/30 pl-3 text-[13px] leading-relaxed text-ink-soft">
              Every sentence is yours. The copilot only fixed grammar and fluency:{" "}
              <span className="underline decoration-accent/70 decoration-dotted decoration-[1.5px] underline-offset-[3px]">
                marked words
              </span>{" "}
              were changed ({aiEditCount} {aiEditCount === 1 ? "edit" : "edits"}). Click one to restore your original wording.
              Hover a sentence to see where it came from; double-click to edit it.
            </p>

            {SECTIONS.map((sec) => {
              const items = sentences.filter((s) => s.section === sec.id);
              return (
                <section key={sec.id} className="mb-8">
                  <h3 className="label mb-2">{sec.label}</h3>
                  {items.length === 0 ? (
                    <p className="font-serif text-[16px] italic text-muted">Nothing recorded for this part.</p>
                  ) : (
                    <p className="font-serif text-[17px] leading-[1.75] text-ink">
                      {items.map((s) =>
                        editing?.id === s.id ? (
                          <span key={s.id} className="my-2 block">
                            <textarea
                              autoFocus
                              value={editing.text}
                              onChange={(e) => setEditing({ id: s.id, text: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEdit();
                                }
                                if (e.key === "Escape") setEditing(null);
                              }}
                              rows={3}
                              className="w-full resize-none rounded-sm border border-hairline bg-sheet p-2 font-serif text-[16px] leading-relaxed outline-none focus:border-accent"
                            />
                            <span className="mt-1 flex gap-3 font-sans text-xs">
                              <button onClick={saveEdit} className="text-accent hover:underline">
                                Save
                              </button>
                              <button onClick={() => setEditing(null)} className="text-muted hover:underline">
                                Cancel
                              </button>
                            </span>
                          </span>
                        ) : (
                          <span key={s.id}>
                            <span
                              onMouseEnter={(e) => showHover(s.id, e.currentTarget)}
                              onMouseLeave={scheduleHide}
                              onDoubleClick={() => setEditing({ id: s.id, text: s.userText ?? segmentsText(s.segments) })}
                              className={`rounded-[2px] transition-colors ${hover?.id === s.id ? "bg-paper" : ""}`}
                            >
                              {s.userText !== undefined ? (
                                <span>{s.userText}</span>
                              ) : (
                                s.segments.map((g, i) =>
                                  g.kind === "same" ? (
                                    <span key={i}>{g.text}</span>
                                  ) : (
                                    <button
                                      key={i}
                                      onClick={() => toggleSegment(s.id, i)}
                                      title={
                                        g.reverted
                                          ? `Your wording. Click to use the copilot's fix: “${g.polished || "(removed)"}”`
                                          : `Changed by the copilot. Your original: “${g.original || "(nothing)"}”. Click to restore.`
                                      }
                                      className={
                                        g.reverted
                                          ? "underline decoration-muted/40 decoration-dashed decoration-1 underline-offset-[3px]"
                                          : "text-accent underline decoration-accent/60 decoration-dotted decoration-[1.5px] underline-offset-[3px] hover:bg-accent-soft"
                                      }
                                    >
                                      {g.reverted ? g.original || "‸" : g.polished || <span className="text-xs">‸</span>}
                                    </button>
                                  ),
                                )
                              )}
                            </span>{" "}
                          </span>
                        ),
                      )}
                    </p>
                  )}
                </section>
              );
            })}
          </>
        )}

        {hover && hovered && !editing && (
          <div
            onMouseEnter={() => hideTimer.current && clearTimeout(hideTimer.current)}
            onMouseLeave={scheduleHide}
            className="fade-up absolute left-10 right-10 z-10 rounded-sm border border-hairline bg-sheet p-4 shadow-[0_6px_24px_rgba(60,45,30,0.12)]"
            style={{ top: hover.top }}
          >
            <p className="label mb-1">From your message</p>
            {source ? (
              <p className="text-[13.5px] leading-relaxed text-ink-soft">
                <span className="mr-1 text-[11px] text-muted">{formatTime(source.timestamp)}</span>“{source.text}”
              </p>
            ) : (
              <p className="text-[13.5px] text-muted">Source message not found.</p>
            )}
            <p className="label mb-1 mt-3">Refers to</p>
            {hovered.citation ? (
              <button
                onClick={() => props.onCitationClick(hovered.citation!)}
                className="group text-left font-serif text-[13.5px] italic leading-snug text-ink-soft"
              >
                <span className="mr-1 font-sans text-[11px] not-italic text-muted group-hover:text-accent">
                  p. {hovered.citation.page}
                </span>
                <span className="decoration-mark-strong decoration-2 underline-offset-2 group-hover:underline">
                  “{hovered.citation.quote}”
                </span>
              </button>
            ) : (
              <p className="text-[13.5px] text-muted">No specific passage.</p>
            )}
            <div className="mt-3 flex gap-4 border-t border-hairline-soft pt-2 text-xs">
              <button
                onClick={() => setEditing({ id: hovered.id, text: hovered.userText ?? segmentsText(hovered.segments) })}
                className="text-accent hover:underline"
              >
                Edit sentence
              </button>
              {hovered.userText !== undefined && (
                <button onClick={() => update(hovered.id, (s) => ({ ...s, userText: undefined }))} className="text-muted hover:underline">
                  Discard my edit
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
