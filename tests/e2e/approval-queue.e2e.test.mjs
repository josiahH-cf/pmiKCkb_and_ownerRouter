import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./helpers/client.mjs";

const SEEDED_ITEM_IDS = [
  "demo-queue-lease-renewals-owner-comms",
  "demo-queue-maintenance-routing-blocked",
  "demo-queue-move-out-snoozed",
  "demo-queue-owner-onboarding-cleanup",
];

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("approval queue flows", () => {
  let client;

  beforeAll(async () => {
    const { resetDemoRecords } = await import("../../scripts/demo-firestore.mjs");
    await resetDemoRecords({ note: "Reset before approval-queue e2e suite." });

    client = createClient();
    await client.signInDemo();
  });

  it("lists the seeded queue items", async () => {
    const response = await client.get("/api/approval-queue");

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.items.map((item) => item.id);

    for (const id of SEEDED_ITEM_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("filters by status, risk, and audience group", async () => {
    const blocked = await (await client.get("/api/approval-queue?status=Blocked")).json();
    expect(blocked.items.map((item) => item.id)).toEqual([
      "demo-queue-maintenance-routing-blocked",
    ]);

    const highRisk = await (await client.get("/api/approval-queue?risk=High")).json();
    expect(highRisk.items.map((item) => item.id)).toEqual([
      "demo-queue-lease-renewals-owner-comms",
    ]);

    const teamFollowUp = await (
      await client.get(
        `/api/approval-queue?audience_group=${encodeURIComponent("Team follow-up")}`,
      )
    ).json();
    expect(teamFollowUp.items.map((item) => item.id)).toEqual([
      "demo-queue-move-out-snoozed",
    ]);
  });

  it("returns item detail with its activity trail", async () => {
    const response = await client.get(
      "/api/approval-queue/demo-queue-lease-renewals-owner-comms",
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.item.id).toBe("demo-queue-lease-renewals-owner-comms");
    expect(body.item.status).toBe("Ready for Approval");
    expect(body.activity.length).toBeGreaterThan(0);
  });

  it("requires high-risk confirmation before approving a High item", async () => {
    const unconfirmed = await client.sendJson(
      "PATCH",
      "/api/approval-queue/demo-queue-lease-renewals-owner-comms",
      { action: "approve" },
    );

    expect(unconfirmed.status).toBe(400);
    await expect(unconfirmed.json()).resolves.toMatchObject({
      error: "High-risk approval requires explicit confirmation.",
    });
  });

  it("approves a High item with confirmation and records activity", async () => {
    const response = await client.sendJson(
      "PATCH",
      "/api/approval-queue/demo-queue-lease-renewals-owner-comms",
      {
        action: "approve",
        confirm_high_risk: true,
        reason: "QA e2e: high-risk approval reason.",
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.item.status).toBe("Approved");
    expect(body.activity.some((entry) => entry.action === "approved")).toBe(true);
  });

  it("runs bulk snooze with per-item outcomes", async () => {
    const response = await client.postJson("/api/approval-queue/bulk", {
      action: "snooze",
      item_ids: ["demo-queue-owner-onboarding-cleanup"],
      reason: "Snoozing until the owner-onboarding note review window.",
      snooze_until: "2026-07-01",
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.results).toEqual([
      expect.objectContaining({
        item_id: "demo-queue-owner-onboarding-cleanup",
        outcome: "updated",
      }),
    ]);
    expect(body.summary.updated).toBe(1);
  });

  it("blocks bulk execute without attempting external writes", async () => {
    const response = await client.postJson("/api/approval-queue/bulk", {
      action: "execute",
      item_ids: ["demo-queue-maintenance-routing-blocked"],
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.results[0].outcome).toBe("skipped");
    expect(body.results[0].message).toContain("Bulk execute is not available");
  });

  it("renders seeded items in the Approval Queue page shell", async () => {
    const { response, html } = await client.getHtml("/approval-queue");

    expect(response.status).toBe(200);
    expect(html).toContain("Approval Queue");
    expect(html).not.toContain("Approval Queue is unavailable");
  });
});
