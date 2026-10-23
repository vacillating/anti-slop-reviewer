import type { SectionId } from "./types";

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "soundness", label: "Soundness" },
  { id: "novelty", label: "Novelty" },
  { id: "clarity", label: "Clarity" },
  { id: "overall", label: "Overall" },
];

export function sectionLabel(id: SectionId | null): string {
  return SECTIONS.find((s) => s.id === id)?.label ?? "Start";
}
