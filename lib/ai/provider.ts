/**
 * AI provider abstraction.
 *
 * OFF BY DEFAULT. Customer text is only sent to an external service when BOTH:
 *   AI_INTERPRETATION_ENABLED=true
 *   AI_PROVIDER=<an id in APPROVED_AI_PROVIDERS with a registered implementation>
 * No external provider is registered yet — Jessica approves one first.
 * Server-only: never import from client components.
 */
import "server-only";
import type { AssistantLookups } from "@/lib/assistant/types";
import type { AiInterpretationRequest, AiProvider, AiResult } from "./types";
import { validateAiOutput } from "./validation";

/** Providers Jessica has approved. Empty until she approves one. */
export const APPROVED_AI_PROVIDERS: readonly string[] = [];

const registry = new Map<string, AiProvider>();

/** Register an implementation (e.g. from a provider module). Ignored unless approved. */
export function registerAiProvider(p: AiProvider) {
  registry.set(p.id, p);
}

export interface AiConfig {
  enabled: boolean;
  provider: string | null;
  timeoutMs: number;
}

export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const provider = env.AI_PROVIDER?.trim() || null;
  const enabled = env.AI_INTERPRETATION_ENABLED === "true" && !!provider && provider !== "none";
  const timeoutMs = Math.min(Math.max(Number(env.AI_TIMEOUT_MS) || 15000, 1000), 60000);
  return { enabled, provider, timeoutMs };
}

/**
 * Ask the configured provider for an interpretation. Never throws.
 * Returns { ok:false, disabled:true } (and sends nothing) unless enabled + approved.
 * `override` is for tests (mock provider) — it bypasses env but not validation.
 */
export async function interpretTicketText(
  request: AiInterpretationRequest,
  lookups: AssistantLookups,
  override?: { provider: AiProvider; timeoutMs?: number },
): Promise<AiResult> {
  let provider: AiProvider | undefined;
  let timeoutMs = 15000;
  if (override) {
    provider = override.provider;
    timeoutMs = override.timeoutMs ?? timeoutMs;
  } else {
    const cfg = getAiConfig();
    if (!cfg.enabled) return { ok: false, provider: null, error: "AI interpretation is off.", disabled: true };
    if (!APPROVED_AI_PROVIDERS.includes(cfg.provider!)) {
      return { ok: false, provider: cfg.provider, error: `AI provider "${cfg.provider}" is not approved.`, disabled: true };
    }
    provider = registry.get(cfg.provider!);
    if (!provider) return { ok: false, provider: cfg.provider, error: `AI provider "${cfg.provider}" is not installed.`, disabled: true };
    timeoutMs = cfg.timeoutMs;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const raw = await Promise.race([
      provider.interpret(request, controller.signal),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("timeout")))),
    ]);
    const v = validateAiOutput(raw, lookups);
    if (!v.ok) return { ok: false, provider: provider.id, error: v.error };
    return { ok: true, provider: provider.id, interpretation: v.value };
  } catch (e) {
    const msg = e instanceof Error && e.message === "timeout" ? "AI timed out." : "AI request failed.";
    return { ok: false, provider: provider.id, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
