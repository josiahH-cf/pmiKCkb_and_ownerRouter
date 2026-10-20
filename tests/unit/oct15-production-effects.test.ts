import { describe, expect, it, vi } from "vitest";
const suspension = vi.hoisted(() => vi.fn(async () => ({ status: "clear" })));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: suspension,
}));
import {
  assertProductionRuntimeActionExecutable,
  isProductionRuntimeActionExecutable,
  runProductionRuntimeGatedAction,
} from "@/lib/operations/runtime-suspension-gate";

describe("October 15 production operation refusals", () => {
  it.each([
    "rentvine.work_order.create",
    "rentvine.work_order.read",
    "rentvine.work_order.update_status",
    "rentvine.work_order.chat.sync",
    "google_drive.maintenance_photo.store",
    "gmail.maintenance_owner_notice.draft_create",
    "gmail.maintenance_owner_notice.send",
    "gmail.message.send",
  ])("refuses %s before a store read or provider factory", async (key) => {
    suspension.mockClear();
    const provider = vi.fn();
    expect(await isProductionRuntimeActionExecutable(key)).toBe(false);
    await expect(assertProductionRuntimeActionExecutable(key)).rejects.toMatchObject({
      status: 410,
    });
    await expect(runProductionRuntimeGatedAction(key, provider)).rejects.toMatchObject({
      status: 410,
    });
    expect(provider).not.toHaveBeenCalled();
    expect(suspension).not.toHaveBeenCalled();
  });
  it.each([
    "gmail.renewal_notice.draft_create",
    "gmail.mailbox.read",
    "gmail.renewal_notice.send",
    "gmail.thread.reply",
  ])("retains the independent runtime gate for %s", async (key) => {
    suspension.mockClear();
    expect(await isProductionRuntimeActionExecutable(key)).toBe(true);
    expect(suspension).toHaveBeenCalledWith(key);
  });
  it("does not open either Dotloop write key", async () => {
    expect(
      await isProductionRuntimeActionExecutable("dotloop.loop.create_from_template"),
    ).toBe(false);
    expect(await isProductionRuntimeActionExecutable("dotloop.document.upload")).toBe(
      false,
    );
  });
});
