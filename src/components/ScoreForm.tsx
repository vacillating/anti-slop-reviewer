"use client";

import { useState } from "react";

const SCORES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

interface Props {
  title: string;
  intro: string;
  withImpression?: boolean;
  submitLabel: string;
  disabled?: boolean;
  disabledNote?: string;
  onSubmit(score: number, impression: string): void;
}

/** Overall score on a 1–5 scale with half points, plus an optional one-line impression. */
export default function ScoreForm({ title, intro, withImpression, submitLabel, disabled, disabledNote, onSubmit }: Props) {
  const [score, setScore] = useState<number | null>(null);
  const [impression, setImpression] = useState("");
  const ready = score !== null && (!withImpression || impression.trim().length > 0) && !disabled;

  return (
    <div className="fade-up">
      <p className="label">{title}</p>
      <p className="mt-3 font-serif text-[17px] leading-relaxed text-ink">{intro}</p>

      <div className="mt-8">
        <p className="mb-3 text-sm text-ink-soft">Overall score</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Overall score">
          {SCORES.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={score === s}
              onClick={() => setScore(s)}
              className={`h-9 min-w-10 rounded-sm border px-2 text-sm tabular-nums transition-colors ${
                score === s
                  ? "border-accent bg-accent text-white"
                  : Number.isInteger(s)
                    ? "border-hairline bg-sheet text-ink hover:border-muted"
                    : "border-hairline-soft bg-sheet text-ink-soft hover:border-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>1 · reject</span>
          <span>5 · accept</span>
        </div>
      </div>

      {withImpression && (
        <label className="mt-8 block">
          <span className="mb-2 block text-sm text-ink-soft">Your first impression, in one line</span>
          <input
            value={impression}
            onChange={(e) => setImpression(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ready && onSubmit(score!, impression.trim())}
            placeholder="In your own words"
            className="w-full border-b border-hairline bg-transparent py-2 font-serif text-[17px] text-ink outline-none placeholder:text-muted/70 focus:border-accent"
          />
        </label>
      )}

      <button
        disabled={!ready}
        onClick={() => ready && onSubmit(score!, impression.trim())}
        className="mt-10 rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
      >
        {submitLabel}
      </button>
      {disabled && disabledNote && <p className="mt-3 text-sm text-muted">{disabledNote}</p>}
    </div>
  );
}
