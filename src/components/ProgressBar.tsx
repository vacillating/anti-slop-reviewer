import { SECTIONS } from "@/lib/sections";
import type { SectionId } from "@/lib/types";

/** Thin progress row of review-form sections. Shows progress only, never content. */
export default function ProgressBar({ current, finished }: { current: SectionId | null; finished: Set<SectionId> }) {
  return (
    <ol className="flex items-center gap-1 text-[13px]">
      {SECTIONS.map((s, i) => {
        const done = finished.has(s.id);
        const active = s.id === current;
        return (
          <li key={s.id} className="flex items-center gap-1">
            {i > 0 && <span className="px-1 text-hairline">·</span>}
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${
                active ? "bg-accent-soft font-semibold text-accent" : done ? "text-ink-soft" : "text-muted"
              }`}
            >
              {done && !active && (
                <svg width="11" height="11" viewBox="0 0 12 12" aria-label="finished" className="text-accent">
                  <path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
