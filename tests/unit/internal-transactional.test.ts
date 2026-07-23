import { describe, expect, it } from "vitest";

import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { buildInternalTransactionalHealth } from "@/lib/firestore/internal-transactional-receipts";
import { isInternalTransactionalDestination } from "@/lib/notifications/internal-destination";
import {
  INTERNAL_TRANSACTIONAL_ACTION_KEY,
  InternalTransactionalError,
  buildInternalTransactionalNotice,
  internalTransactionalDedupKey,
  sendInternalTransactionalNotice,
  type InternalTransactionalDeps,
  type InternalTransactionalInput,
  type InternalTransactionalReceipt,
} from "@/lib/notifications/internal-transactional";

const NOW = "2026-07-23T12:00:00.000Z";
const INPUT: InternalTransactionalInput = {
  reportId: "rep-1",
  route: "/lease-renewal/live",
  origin: "app",
  reporterRole: "Editor",
  filedAtIso: NOW,
};

// An Action Registry with the internal key FLIPPED ON, to exercise the send machinery (S39.3 posture).
const OPEN_REGISTRY = ACTION_REGISTRY_SEED.map((entry) =>
  entry.key === INTERNAL_TRANSACTIONAL_ACTION_KEY
    ? {
        ...entry,
        readiness: "Approved for Execution" as const,
        evidence_status: "Documented" as const,
        production_allowed: true,
      }
    : entry,
);

function makeDeps(overrides: Partial<InternalTransactionalDeps> = {}) {
  const sent: Array<{ to: string; subject: string; body: string }> = [];
  const receipts = new Map<string, InternalTransactionalReceipt>();
  const deps: InternalTransactionalDeps = {
    resolveDestination: async () => "ops@pmikcmetro.com",
    sender: {
      send: async (message) => {
        sent.push(message);
      },
    },
    getReceipt: async (key) => receipts.get(key) ?? null,
    recordReceipt: async (receipt) => {
      receipts.set(receipt.dedup_key, receipt);
    },
    registry: OPEN_REGISTRY,
    appBaseUrl: "https://app.pmikcmetro.com",
    nowIso: () => NOW,
    ...overrides,
  };
  return { deps, sent, receipts };
}

describe("isInternalTransactionalDestination (AC-S39-4 domain lock)", () => {
  it("accepts only exact internal-domain addresses", () => {
    expect(isInternalTransactionalDestination("ops@pmikcmetro.com")).toBe(true);
    expect(isInternalTransactionalDestination("  Ops@PMIKCMetro.com ")).toBe(true);
  });
  it("rejects external, subdomain-spoof, and malformed addresses", () => {
    for (const bad of [
      "tenant@gmail.com",
      "owner@example.com",
      "x@evil.pmikcmetro.com",
      "y@pmikcmetro.com.evil.com",
      "a@b@pmikcmetro.com",
      "@pmikcmetro.com",
      "not-an-email",
      "",
    ]) {
      expect(isInternalTransactionalDestination(bad)).toBe(false);
    }
  });
});

describe("buildInternalTransactionalNotice (metadata-only — AC-S39-3)", () => {
  it("carries route/origin/role/time + the /admin deep link, never a description or element", () => {
    const { subject, body } = buildInternalTransactionalNotice(
      INPUT,
      "https://app.pmikcmetro.com",
    );
    expect(subject).toContain("/lease-renewal/live");
    expect(body).toContain("Route: /lease-renewal/live");
    expect(body).toContain("Origin: app");
    expect(body).toContain("Reporter role: Editor");
    expect(body).toContain(NOW);
    expect(body).toContain("https://app.pmikcmetro.com/admin");
    // Never an element hint, reporter identity, or DOM/free-text content (the input carries none by
    // construction — InternalTransactionalInput has no description/element/uid field).
    expect(body).not.toMatch(/element|reporter_uid|\buid\b|aria|textContent/i);
  });
});

describe("sendInternalTransactionalNotice", () => {
  it("refuses when the gate is CLOSED (injected closed registry) — no send (AC-S39-6)", async () => {
    const closedRegistry = ACTION_REGISTRY_SEED.map((entry) =>
      entry.key === INTERNAL_TRANSACTIONAL_ACTION_KEY
        ? { ...entry, production_allowed: false }
        : entry,
    );
    const { deps, sent } = makeDeps({ registry: closedRegistry });
    await expect(sendInternalTransactionalNotice(deps, INPUT)).rejects.toThrow();
    expect(sent).toHaveLength(0);
  });

  it("the COMMITTED seed has the internal send flipped ON, so the machinery runs (S39.3 flip)", async () => {
    // registry:undefined → the default committed ACTION_REGISTRY_SEED, now production_allowed:true.
    const { deps, sent } = makeDeps({ registry: undefined });
    const receipt = await sendInternalTransactionalNotice(deps, INPUT);
    expect(receipt.delivered).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("resolves the recipient ONLY from the SYSTEM read and sends a metadata-only notice (AC-S39-4)", async () => {
    const { deps, sent } = makeDeps();
    const receipt = await sendInternalTransactionalNotice(deps, INPUT);

    expect(receipt.delivered).toBe(true);
    expect(receipt.recipient).toBe("ops@pmikcmetro.com");
    expect(receipt.dedup_key).toBe("support_report:rep-1:filed");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("ops@pmikcmetro.com");
    expect(sent[0].body).toContain("Route: /lease-renewal/live");
  });

  it("REFUSES an absent destination (never guesses) — no send (AC-S39-4)", async () => {
    const { deps, sent } = makeDeps({ resolveDestination: async () => "" });
    await expect(sendInternalTransactionalNotice(deps, INPUT)).rejects.toBeInstanceOf(
      InternalTransactionalError,
    );
    expect(sent).toHaveLength(0);
  });

  it("REFUSES a non-internal destination — never sends externally (AC-S39-4)", async () => {
    const { deps, sent } = makeDeps({
      resolveDestination: async () => "tenant@gmail.com",
    });
    await expect(sendInternalTransactionalNotice(deps, INPUT)).rejects.toBeInstanceOf(
      InternalTransactionalError,
    );
    expect(sent).toHaveLength(0);
  });

  it("is idempotent: a delivered receipt short-circuits with NO second send (AC-S39-5)", async () => {
    const { deps, sent } = makeDeps();
    await sendInternalTransactionalNotice(deps, INPUT);
    expect(sent).toHaveLength(1);
    // Second call for the same report id — the delivered receipt is returned, no new send.
    const again = await sendInternalTransactionalNotice(deps, INPUT);
    expect(again.delivered).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("records delivered:false on a transport failure without throwing, and is retryable (AC-S39-5)", async () => {
    let attempts = 0;
    const { deps } = makeDeps({
      sender: {
        send: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("gmail 503");
        },
      },
    });
    const first = await sendInternalTransactionalNotice(deps, INPUT);
    expect(first.delivered).toBe(false);
    expect(first.error).toContain("gmail 503");
    // A failed receipt does NOT short-circuit — the retry re-attempts and succeeds.
    const retry = await sendInternalTransactionalNotice(deps, INPUT);
    expect(retry.delivered).toBe(true);
    expect(attempts).toBe(2);
  });

  it("keys the dedup on the report-filed event", () => {
    expect(internalTransactionalDedupKey("abc")).toBe("support_report:abc:filed");
  });
});

describe("buildInternalTransactionalHealth", () => {
  const receipt = (
    overrides: Partial<InternalTransactionalReceipt>,
  ): InternalTransactionalReceipt => ({
    dedup_key: "support_report:x:filed",
    action_key: "internal.transactional_notice.send",
    report_id: "x",
    recipient: "ops@pmikcmetro.com",
    delivered: true,
    attempted_at: NOW,
    ...overrides,
  });

  it("is healthy when every receipt delivered", () => {
    expect(buildInternalTransactionalHealth([receipt({}), receipt({})])).toMatchObject({
      status: "healthy",
      failed_delivery_count: 0,
      delivered_count: 2,
    });
  });

  it("raises attention and names the latest failure when any delivery failed", () => {
    const health = buildInternalTransactionalHealth([
      receipt({ delivered: true }),
      receipt({
        report_id: "old",
        delivered: false,
        attempted_at: "2026-07-20T00:00:00.000Z",
        error: "old fail",
      }),
      receipt({
        report_id: "new",
        delivered: false,
        attempted_at: "2026-07-23T00:00:00.000Z",
        error: "new fail",
      }),
    ]);
    expect(health.status).toBe("attention");
    expect(health.failed_delivery_count).toBe(2);
    expect(health.last_failure?.report_id).toBe("new");
    expect(health.last_failure?.error).toBe("new fail");
  });
});
