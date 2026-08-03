import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { CreateApprovalQueueItemInputSchema } from "@/lib/firestore/schemas";

const root = resolve(import.meta.dirname, "../..");

const liveApprovalInput = {
  process_run_ref: { id: "run-live-1", label: "Live workflow run" },
  item_type: "ApprovalPackage" as const,
  source_trigger_key: "workflow:run-live-1:approval",
  action_needed: "Review the Live workflow action.",
  direct_link: "/approval-queue?item=approval-live-1",
};

describe("S56 Production Live-only environment boundary", () => {
  it("resolves the local rehearsal surface explicitly as Demo plus Live read-only", () => {
    expect(
      resolveEnvironmentDescriptor({
        ENVIRONMENT_KIND: "demo",
        DATA_CONTEXT: "live_readonly",
      }),
    ).toEqual({
      ok: true,
      descriptor: {
        environmentKind: "demo",
        dataContext: "live_readonly",
        source: "explicit",
      },
    });
  });

  it("resolves Production explicitly as Live only", () => {
    expect(
      resolveEnvironmentDescriptor({
        ENVIRONMENT_KIND: "production",
        DATA_CONTEXT: "live",
      }),
    ).toEqual({
      ok: true,
      descriptor: {
        environmentKind: "production",
        dataContext: "live",
        source: "explicit",
      },
    });
  });

  it.each([
    { ENVIRONMENT_KIND: "demo", DATA_CONTEXT: "live" },
    { ENVIRONMENT_KIND: "production", DATA_CONTEXT: "live_readonly" },
    { ENVIRONMENT_KIND: "production", DATA_CONTEXT: "demo" },
  ])("refuses an unsupported $ENVIRONMENT_KIND+$DATA_CONTEXT pair", (env) => {
    expect(resolveEnvironmentDescriptor(env).ok).toBe(false);
  });

  it("accepts an ordinary Live approval input and structurally rejects Test", () => {
    expect(
      CreateApprovalQueueItemInputSchema.safeParse({
        ...liveApprovalInput,
        data_mode: "live",
      }).success,
    ).toBe(true);
    expect(
      CreateApprovalQueueItemInputSchema.safeParse({
        ...liveApprovalInput,
        data_mode: "test",
      }).success,
    ).toBe(false);
  });

  it("has no compatibility Test-lane module left to import", () => {
    expect(existsSync(resolve(root, "lib/environment/test-lane.ts"))).toBe(false);
    expect(existsSync(resolve(root, "lib/environment/data-mode-write-boundary.ts"))).toBe(
      false,
    );
  });
});
