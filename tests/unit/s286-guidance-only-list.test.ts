import { describe, expect, it } from "vitest";

import {
  GUIDANCE_ONLY_PROCESS_DEFINITION_IDS,
  GUIDANCE_ONLY_RUN_RECORD_NOTICE,
  GUIDANCE_ONLY_RUN_START_REFUSAL,
  GUIDANCE_ONLY_STAFF_FIELD_NOTE,
  guidanceSourceHref,
  hasPublishedVersion,
  isGuidanceOnlyProcessDefinitionId,
  isGuidanceOnlySpace,
  isGuidanceOnlyWorkflowRun,
  withoutUnusedGuidanceStaffFields,
} from "@/lib/processes/guidance-only";
import { LEASE_RENEWAL_DEFINITION_ID } from "@/lib/lease-renewal/process-definition-seed";
import { OWNER_RENEWAL_OUTREACH_DEFINITION_ID } from "@/lib/lease-renewal/owner-renewal-outreach/process-definition-seed";
import { TENANT_RENEWAL_NOTICE_DEFINITION_ID } from "@/lib/lease-renewal/tenant-renewal-notice/process-definition-seed";
import { launchSpaces } from "@/lib/spaces";

// S286 ARCH-S286-1: one list names the process definitions that are guidance only, and every
// surface reads it. These checks pin the list to the three renewal Spaces and their seeded ids.

describe("ARCH-S286-1 the one guidance-only list", () => {
  it("ARCH-S286-1 names exactly the three renewal process definitions by their seeded ids", () => {
    expect([...GUIDANCE_ONLY_PROCESS_DEFINITION_IDS].sort()).toEqual(
      [
        LEASE_RENEWAL_DEFINITION_ID,
        OWNER_RENEWAL_OUTREACH_DEFINITION_ID,
        TENANT_RENEWAL_NOTICE_DEFINITION_ID,
      ].sort(),
    );
    expect(Object.isFrozen(GUIDANCE_ONLY_PROCESS_DEFINITION_IDS)).toBe(true);
  });

  it("ARCH-S286-1 matches the processes of the three Renewals Spaces and no other Space", () => {
    const renewalSpaces = launchSpaces.filter(
      (space) => space.processCategory === "Renewals",
    );
    expect(renewalSpaces.map((space) => space.id).sort()).toEqual([
      "lease-renewals",
      "owner-renewal-outreach",
      "tenant-renewal-notice",
    ]);
    for (const space of launchSpaces)
      expect(isGuidanceOnlySpace(space), space.id).toBe(
        space.processCategory === "Renewals",
      );
    expect(renewalSpaces.map((space) => space.processDefinitionId).sort()).toEqual(
      [...GUIDANCE_ONLY_PROCESS_DEFINITION_IDS].sort(),
    );
  });

  it("ARCH-S286-1 matches by the definition id only, so a custom process stays runnable", () => {
    for (const id of GUIDANCE_ONLY_PROCESS_DEFINITION_IDS) {
      expect(isGuidanceOnlyProcessDefinitionId(id)).toBe(true);
      expect(isGuidanceOnlyWorkflowRun({ definition_id: id })).toBe(true);
    }
    for (const id of [
      "move-in",
      "move-out-deposit-disposition",
      "maintenance-work-order-intake",
      "def-1",
      "",
      "Owner-Renewal-Outreach",
      " lease-renewal",
    ])
      expect(isGuidanceOnlyProcessDefinitionId(id), id).toBe(false);
    expect(isGuidanceOnlyProcessDefinitionId(undefined)).toBe(false);
    expect(isGuidanceOnlyProcessDefinitionId(null)).toBe(false);
    expect(isGuidanceOnlyWorkflowRun({})).toBe(false);
    // A custom definition stamped with a renewal Space is not one of the three definitions.
    expect(isGuidanceOnlyWorkflowRun({ definition_id: "0193-custom-uuid" })).toBe(false);
  });

  it("ARCH-S286-1 carries the exact staff sentences", () => {
    expect(GUIDANCE_ONLY_RUN_START_REFUSAL).toBe(
      "Renewal work is done on the Renewal Desk. This process is guidance.",
    );
    expect(GUIDANCE_ONLY_RUN_RECORD_NOTICE).toBe(
      "This run is kept as a record. Renewal work continues on the Renewal Desk.",
    );
    expect(GUIDANCE_ONLY_STAFF_FIELD_NOTE).toBe("Not used: this process starts no runs");
  });
});

describe("R-S286-5 unused run owner and approver on a renewal definition", () => {
  it("R-S286-5 drops a blank or absent run owner and approver only for the three definitions", () => {
    for (const id of GUIDANCE_ONLY_PROCESS_DEFINITION_IDS) {
      expect(
        withoutUnusedGuidanceStaffFields(id, {
          expected_revision: "a".repeat(64),
          name: "Owner outreach",
          owner_uid: "",
          default_approver_uid: "   ",
        }),
      ).toEqual({ expected_revision: "a".repeat(64), name: "Owner outreach" });
      expect(
        withoutUnusedGuidanceStaffFields(id, { owner_uid: null, name: "N" }),
      ).toEqual({ name: "N" });
      // A non-blank value is kept as sent.
      expect(
        withoutUnusedGuidanceStaffFields(id, { owner_uid: "staff-1", name: "N" }),
      ).toEqual({ owner_uid: "staff-1", name: "N" });
    }
  });

  it("R-S286-5 passes every other definition and every non-object body through unchanged", () => {
    const body = { owner_uid: "", default_approver_uid: "", name: "Move-in" };
    expect(withoutUnusedGuidanceStaffFields("move-in", body)).toBe(body);
    expect(withoutUnusedGuidanceStaffFields("owner-renewal-outreach", null)).toBeNull();
    expect(withoutUnusedGuidanceStaffFields("owner-renewal-outreach", "text")).toBe(
      "text",
    );
    const list = [{ owner_uid: "" }];
    expect(withoutUnusedGuidanceStaffFields("owner-renewal-outreach", list)).toBe(list);
  });
});

describe("R-S286-1 and R-S286-4 published guidance", () => {
  it("R-S286-4 counts a process as published only when Active with an immutable version", () => {
    expect(hasPublishedVersion({ status: "Active", active_version_id: "v-1" })).toBe(
      true,
    );
    expect(hasPublishedVersion({ status: "Active" })).toBe(false);
    expect(hasPublishedVersion({ status: "Active", active_version_id: " " })).toBe(false);
    expect(hasPublishedVersion({ status: "Draft", active_version_id: "v-1" })).toBe(
      false,
    );
    expect(hasPublishedVersion({ status: "Retired", active_version_id: "v-1" })).toBe(
      false,
    );
    expect(hasPublishedVersion({ status: "Pending Approval" })).toBe(false);
  });

  it("R-S286-1 links a source only on the web and shows any other scheme as text", () => {
    expect(guidanceSourceHref("https://example.test/procedure")).toBe(
      "https://example.test/procedure",
    );
    expect(guidanceSourceHref("http://example.test/notes")).toBe(
      "http://example.test/notes",
    );
    expect(guidanceSourceHref("javascript:alert(1)")).toBeNull();
    expect(guidanceSourceHref("data:text/html,hi")).toBeNull();
    expect(guidanceSourceHref("not a url")).toBeNull();
  });
});
