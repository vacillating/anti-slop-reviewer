export type SectionId = "summary" | "soundness" | "novelty" | "clarity" | "overall";

export type CopilotTurnType = "walkthrough" | "question" | "answer" | "fact_correction" | "decline";

export type ReviewerTurnType =
  | "initial_impression"
  | "reviewer_reply"
  | "selection_question"
  | "define_request"
  | "simplify_request";

export type TurnType = CopilotTurnType | ReviewerTurnType;

export interface Citation {
  page: number;
  quote: string;
  /** Server-side check: the quote was found in the extracted paper text. */
  verified?: boolean;
}

export interface Turn {
  id: string;
  speaker: "copilot" | "reviewer";
  type: TurnType;
  section: SectionId | null;
  text: string;
  citations: Citation[];
  timestamp: string;
  /** Text the reviewer selected in the PDF, if the turn came from "Ask about this". */
  selection?: { page: number; text: string };
}

/** What the copilot API returns for one turn (the format in prompts/copilot.ts). */
export interface CopilotTurn {
  type: CopilotTurnType;
  text: string;
  citations: Citation[];
}

export type CopilotAction = "walkthrough" | "question" | "respond" | "simplify" | "define";

export interface CopilotRequest {
  action: CopilotAction;
  section: SectionId;
  pages: string[];
  history: Pick<Turn, "speaker" | "type" | "section" | "text">[];
  userText?: string;
  selection?: { page: number; text: string };
  term?: string;
  /** Text to restate more simply (for action "simplify"). */
  target?: string;
}

/** One edit the AI made while polishing a reviewer sentence. */
export type Segment =
  | { kind: "same"; text: string }
  | { kind: "ai"; original: string; polished: string; reverted: boolean };

export interface ReviewSentence {
  id: string;
  section: SectionId;
  sourceTurnId: string | null;
  original: string;
  polished: string;
  segments: Segment[];
  /** Set once the reviewer edits the sentence by hand; overrides segments. */
  userText?: string;
  citation?: Citation;
}

export interface ReviewDraft {
  generatedAt: string;
  sentences: ReviewSentence[];
}

export interface ReviewRequestMessage {
  id: string;
  section: SectionId;
  text: string;
  /** How the copilot classified the message (e.g. "answer" means it was a factual question). */
  copilotResponseType?: CopilotTurnType;
}
