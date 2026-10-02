/**
 * AI interpretation — provider-agnostic contract.
 * The AI only PROPOSES. Its output is untrusted: it is validated server-side
 * (lib/ai/validation.ts) and reconciled with deterministic results, which always
 * win. The AI never writes to Supabase.
 */
import type { AssistantFieldKey } from "@/lib/assistant/fields";
import type { AssistantMode } from "@/lib/assistant/types";

export interface AiInterpretationRequest {
  mode: AssistantMode;
  /** The pasted text. Only sent when AI is enabled with an approved provider. */
  text: string;
  /** Existing ticket values (Quick Update) — allowlisted fields only. */
  context: Partial<Record<AssistantFieldKey, string>>;
  /** What deterministic parsing already found (the AI must not contradict these). */
  deterministic: Partial<Record<AssistantFieldKey, string>>;
  /** Names the AI may choose from (ids are resolved locally). */
  materials: string[];
  departments: string[];
  /** Note prefix to use, e.g. "SW/ Greg - ". */
  notePrefix: string;
}

/** Raw provider response (unknown shape until validated). */
export type AiRawResponse = unknown;

export interface AiProvider {
  /** Stable id, e.g. "anthropic". Must also be listed in APPROVED_AI_PROVIDERS. */
  readonly id: string;
  interpret(request: AiInterpretationRequest, signal: AbortSignal): Promise<AiRawResponse>;
}

/** Validated AI output (see validation.ts). */
export interface AiInterpretation {
  fields: { key: AssistantFieldKey; value: string; evidence?: string; reason?: string }[];
  note: string | null;
  actions: { type: "close_ticket"; reason: string }[];
  rejected: string[];
}

export type AiResult =
  | { ok: true; provider: string; interpretation: AiInterpretation }
  | { ok: false; provider: string | null; error: string; disabled?: boolean };
