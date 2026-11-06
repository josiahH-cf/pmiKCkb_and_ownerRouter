// S249 with S250 (L28, L40): the Gmail draft review asked while the lease's RentVine generation is
// being replaced answers with the notice-safety reason only. As "Review and send" already does,
// the review is asked again a bounded few times: previews only. A create, a confirmation, a send
// and a save are never sent again. Synthetic values only.
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  COMPOSITION_REREAD_WAITS_MS,
  draftPreviewWaitsOnGeneration,
  previewAgainWhileGenerationReplaced,
} from "@/components/lease-renewal/RenewalPreparedMessage";
import { NOTICE_GENERATION_NOT_READY } from "@/lib/lease-renewal/notice-source-error";

const BLOCKED = {
  status: "blocked",
  channel: "owner",
  reasons: [NOTICE_GENERATION_NOT_READY],
};
const READY = { status: "preview", channel: "owner", executionId: "e-1" };
const noWait = vi.fn(async () => undefined);

describe("the draft review waits only on a generation being replaced", () => {
  it("reads only the notice-safety reason alone as waiting", () => {
    expect(draftPreviewWaitsOnGeneration(BLOCKED)).toBe(true);
    expect(
      draftPreviewWaitsOnGeneration({
        ...BLOCKED,
        reasons: [NOTICE_GENERATION_NOT_READY, "The owner recipient is not verified."],
      }),
    ).toBe(false);
    expect(
      draftPreviewWaitsOnGeneration({ ...BLOCKED, reasons: ["Move-out notice given."] }),
    ).toBe(false);
    expect(draftPreviewWaitsOnGeneration(READY)).toBe(false);
    expect(draftPreviewWaitsOnGeneration(null)).toBe(false);
  });

  it("asks again until the review is ready, and no more", async () => {
    const again = vi
      .fn()
      .mockResolvedValueOnce(BLOCKED)
      .mockResolvedValueOnce(READY)
      .mockResolvedValue(BLOCKED);
    const result = await previewAgainWhileGenerationReplaced(
      BLOCKED,
      again,
      draftPreviewWaitsOnGeneration,
      noWait,
    );
    expect(result).toBe(READY);
    expect(again).toHaveBeenCalledTimes(2);
  });

  it("stops after the bounded few and answers with the last review", async () => {
    const again = vi.fn().mockResolvedValue(BLOCKED);
    const result = await previewAgainWhileGenerationReplaced(
      BLOCKED,
      again,
      draftPreviewWaitsOnGeneration,
      noWait,
    );
    expect(result).toBe(BLOCKED);
    expect(again).toHaveBeenCalledTimes(COMPOSITION_REREAD_WAITS_MS.length);
  });

  it("asks nothing again for a ready review or another refusal", async () => {
    const again = vi.fn();
    await previewAgainWhileGenerationReplaced(
      READY,
      again,
      draftPreviewWaitsOnGeneration,
      noWait,
    );
    await previewAgainWhileGenerationReplaced(
      { ...BLOCKED, reasons: ["Move-out notice given."] },
      again,
      draftPreviewWaitsOnGeneration,
      noWait,
    );
    expect(again).not.toHaveBeenCalled();
  });
});

describe("the Gmail draft action re-reads its review only", () => {
  const source = readFileSync(
    "components/lease-renewal/RenewalMessagePreparation.tsx",
    "utf8",
  );
  const draft = source.slice(source.indexOf("async function draft("));
  const body = draft.slice(0, draft.indexOf("\n  }\n"));

  it("the preview asks again through the bounded re-read, without its save", () => {
    expect(body).toContain("previewAgainWhileGenerationReplaced(");
    // The repeat carries what is displayed and never the save the first request made.
    expect(body).toMatch(/previewOnly/);
  });

  it("a create, a reconcile or a confirmation is never asked again", () => {
    const guarded = body.slice(body.indexOf("previewAgainWhileGenerationReplaced("));
    expect(body).toMatch(
      /kind === "preview"[\s\S]{0,200}previewAgainWhileGenerationReplaced\(/,
    );
    expect(guarded).not.toMatch(/confirm:/);
  });
});
