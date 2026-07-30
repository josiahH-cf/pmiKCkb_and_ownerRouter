import { describe, expect, it, vi } from "vitest";

import {
  LIVE_EFFECT_REQUIRES_ATTENTION_MARKER,
  createLiveEffectAttentionEvent,
  emitLiveEffectAttentionSafely,
  emitLiveEffectRequiresAttention,
} from "@/lib/operations/live-effect-attention-log";

describe("LIVE_EFFECT_REQUIRES_ATTENTION structured log", () => {
  it.each(["failed", "ambiguous"] as const)(
    "emits one exact value-free LIVE %s event",
    (state) => {
      const source = {
        actionKey: "vendor.gmail.health",
        executionId: "external_1234567890abcdef",
        state,
        dataMode: "live" as const,
        recipient: "resident@example.invalid",
        error: "Message body for Tenant Name at Unit 123",
        token: "secret-token-value",
      };
      const event = createLiveEffectAttentionEvent(source);
      const sink = { error: vi.fn() };

      expect(event).toEqual({
        marker: LIVE_EFFECT_REQUIRES_ATTENTION_MARKER,
        action_key: "vendor.gmail.health",
        execution_id: "external_1234567890abcdef",
        state,
        data_mode: "live",
      });
      emitLiveEffectRequiresAttention(event!, sink);

      expect(sink.error).toHaveBeenCalledTimes(1);
      const line = String(sink.error.mock.calls[0]?.[0]);
      expect(JSON.parse(line)).toEqual(event);
      expect(Object.keys(JSON.parse(line))).toEqual([
        "marker",
        "action_key",
        "execution_id",
        "state",
        "data_mode",
      ]);
      for (const forbidden of [
        source.recipient,
        source.error,
        "Tenant Name",
        "Unit 123",
        source.token,
      ]) {
        expect(line).not.toContain(forbidden);
      }
    },
  );

  it("suppresses Test-lane failures before an emitter can run", () => {
    expect(
      createLiveEffectAttentionEvent({
        actionKey: "vendor.gmail.health",
        executionId: "external_test",
        state: "failed",
        dataMode: "test",
      }),
    ).toBeNull();
  });

  it("does not let a throwing production sink escape", () => {
    const event = createLiveEffectAttentionEvent({
      actionKey: "vendor.gmail.health",
      executionId: "external_sink_failure",
      state: "ambiguous",
      dataMode: "live",
    })!;
    const sink = {
      error: vi.fn(() => {
        throw new Error("fixture sink unavailable");
      }),
    };

    expect(() => emitLiveEffectRequiresAttention(event, sink)).not.toThrow();
    expect(sink.error).toHaveBeenCalledTimes(1);
  });

  it("does not let an injected async emitter rejection escape", async () => {
    const event = createLiveEffectAttentionEvent({
      actionKey: "vendor.gmail.health",
      executionId: "external_async_sink_failure",
      state: "failed",
      dataMode: "live",
    })!;

    await expect(
      emitLiveEffectAttentionSafely(async () => {
        throw new Error("fixture async sink unavailable");
      }, event),
    ).resolves.toBeUndefined();
  });
});
