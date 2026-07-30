export const LIVE_EFFECT_REQUIRES_ATTENTION_MARKER =
  "LIVE_EFFECT_REQUIRES_ATTENTION" as const;

export type LiveEffectAttentionState = "failed" | "ambiguous";

/** The complete value-free A2 payload. Do not add provider, recipient, error, or customer fields. */
export interface LiveEffectAttentionEvent {
  marker: typeof LIVE_EFFECT_REQUIRES_ATTENTION_MARKER;
  action_key: string;
  execution_id: string;
  state: LiveEffectAttentionState;
  data_mode: "live";
}

export type LiveEffectAttentionEmitter = (
  event: Readonly<LiveEffectAttentionEvent>,
) => void | Promise<void>;

export interface LiveEffectAttentionInput {
  actionKey: string;
  executionId: string;
  state: LiveEffectAttentionState;
  dataMode: "live" | "test";
}

interface ErrorLogSink {
  error(line: string): void;
}

/**
 * Project only the five approved fields and suppress Test-lane failures. Accepting an object rather
 * than a full execution record keeps customer/provider values structurally outside the log payload.
 */
export function createLiveEffectAttentionEvent(
  input: LiveEffectAttentionInput,
): Readonly<LiveEffectAttentionEvent> | null {
  if (input.dataMode !== "live") return null;
  return Object.freeze({
    marker: LIVE_EFFECT_REQUIRES_ATTENTION_MARKER,
    action_key: input.actionKey,
    execution_id: input.executionId,
    state: input.state,
    data_mode: "live",
  });
}

/**
 * Write one bare JSON line so Cloud Logging can expose it as jsonPayload. Logging is observational:
 * even a broken sink must never change the result of the durable transition that already committed.
 */
export function emitLiveEffectRequiresAttention(
  event: Readonly<LiveEffectAttentionEvent>,
  sink: ErrorLogSink = console,
): void {
  try {
    sink.error(JSON.stringify(event));
  } catch {
    // The Firestore transition remains authoritative. Monitoring failure cannot roll it back.
  }
}

/** Apply the same non-interference rule to injected async test/adapter emitters. */
export async function emitLiveEffectAttentionSafely(
  emitter: LiveEffectAttentionEmitter,
  event: Readonly<LiveEffectAttentionEvent>,
): Promise<void> {
  try {
    await emitter(event);
  } catch {
    // The caller invokes this only after commit; never turn an alert-sink failure into a write retry.
  }
}
