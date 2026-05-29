import { describe, expect, it } from "vitest";
import { readAdminObservability } from "@/lib/admin/observability";
import { readServerConfig } from "@/lib/config/server";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

describe("admin observability", () => {
  it("summarizes Ask, approval, notification, and setup health metrics", async () => {
    const db = new FakeFirestore();

    db.seed("ask_logs/log-1", {
      created_at: "2026-05-28T00:00:00.000Z",
      source_state: "Verified Source",
      space_id: "lease-renewals",
    });
    db.seed("ask_logs/log-2", {
      created_at: "2026-05-01T00:00:00.000Z",
      source_state: "No Reliable Source Found",
      space_id: "owner-onboarding",
    });
    db.seed("sops/sop-1", {
      id: "sop-1",
      space_id: "lease-renewals",
      status: "In Review",
    });
    db.seed("templates/template-1", {
      id: "template-1",
      space_id: "lease-renewals",
      status: "In Review",
    });
    db.seed("placeholders/placeholder-1", {
      id: "placeholder-1",
      owner_uid: "owner-1",
      space_id: "lease-renewals",
      status: "Open",
    });
    db.seed("sources_meta/source-1", {
      drive_file_id: "source-1",
      space_id: "lease-renewals",
    });
    db.seed("notification_logs/log-1", {
      status: "Failed",
    });

    const metrics = await readAdminObservability({
      config: readServerConfig({
        SPACE_DRIVE_FOLDER_IDS: '{"lease-renewals":"gs://bucket/lease-renewals/"}',
        SPACE_VERTEX_DATA_STORE_IDS: '{"lease-renewals":"kb-lease-renewals-txt"}',
      }),
      db: db as never,
      now: new Date("2026-05-29T00:00:00.000Z"),
    });

    expect(metrics.askLast7Days).toBe(1);
    expect(metrics.askLast30Days).toBe(2);
    expect(metrics.queueDepthByType).toEqual({
      Placeholder: 1,
      SOP: 1,
      Template: 1,
    });
    expect(metrics.notificationFailures).toBe(1);
    expect(metrics.openPlaceholdersByOwner).toEqual({ "owner-1": 1 });
    expect(metrics.topSpaces[0]).toMatchObject({
      count: 1,
      spaceId: "lease-renewals",
    });
    expect(
      metrics.setupHealth.find((space) => space.spaceId === "lease-renewals"),
    ).toMatchObject({
      dataStoreConfigured: true,
      sourceMetaCount: 1,
      sourceTargetConfigured: true,
    });
  });
});
