export type SlotField = { key: string; label: string; required: boolean; long?: boolean; placeholder?: string; hint?: string };
export type SlotSchema = { fields: SlotField[]; example?: string };

export type UnderstandInput = {
  brief: string;
  categoryKey: string;
  categoryLabel: string;
  schema: SlotSchema;
  /** Today's date in the org's timezone, e.g. "Saturday 4 October 2026", so "next Sunday" resolves. */
  today: string;
};

/** What the AI picked out of a brief. Only fields it actually found; never invented values. */
export type Understanding = { fields: Record<string, string>; unplaced: string[]; provider: string };

export type ProviderName = "mock" | "gemini" | "groq";

export interface CopyProvider {
  name: ProviderName;
  /** Returns the model's raw JSON reply; validation happens in one place (validate.ts). */
  understand(input: UnderstandInput): Promise<unknown>;
}

export type AIErrorKind = "config" | "rate_limit" | "invalid" | "network";
export class AIError extends Error {
  constructor(public kind: AIErrorKind, message: string) {
    super(message);
    this.name = "AIError";
  }
}
