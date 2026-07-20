import { describe, expect, it } from "vitest";

import { launchEditableSeedsBySpaceId } from "@/lib/launch/content";
import { SAMPLE_REPLY_TEMPLATES } from "@/lib/gmail-inbox-zero/sample-hub";
import { WELCOME_V1_BASE_COPY } from "@/lib/move-in/welcome-draft";
import {
  buildLaunchTemplateSeedRecords,
  launchSkeletonDeleteFieldsFor,
} from "../../scripts/seed-launch-skeletons.mjs";

// F-TMPL-2/F-TMPL-6 seed-consistency guard. The Admin-editable process copy lives in THREE hand-kept
// places — the code fallbacks (SAMPLE_REPLY_TEMPLATES / WELCOME_V1_BASE_COPY), the in-memory launch seed
// (lib/launch/content.ts), and the live seed writer (scripts/seed-launch-skeletons.mjs, which cannot
// import TS). This test fails on a one-character drift between them, so the store-backed path and the
// fallback path can never diverge and quietly change what a composer drafts.

const REPLY_IDS = ["tpl-vendor-ack", "tpl-scheduling-ack", "tpl-proposed-portal"];
const WELCOME_ID = "move-in-welcome-email";

function contentTemplate(spaceId, id) {
  const seed = launchEditableSeedsBySpaceId[spaceId];
  return seed?.templates.find((template) => template.id === id);
}

function mjsTemplate(id) {
  return buildLaunchTemplateSeedRecords("2026-07-20T00:00:00.000Z").find(
    (record) => record.id === id,
  )?.data;
}

function sampleBody(id) {
  return SAMPLE_REPLY_TEMPLATES.find((sample) => sample.id === id)?.body;
}

describe("launch seed consistency (F-TMPL-2/F-TMPL-6)", () => {
  it("seeds every sample reply pattern into daily-inbox-triage with byte-identical bodies", () => {
    for (const id of REPLY_IDS) {
      const fromSample = sampleBody(id);
      expect(fromSample, `sample missing ${id}`).toBeTruthy();
      expect(contentTemplate("daily-inbox-triage", id)?.body).toBe(fromSample);
      expect(mjsTemplate(id)?.body).toBe(fromSample);
    }
  });

  it("seeds the move-in welcome email from the frozen base copy, byte-identical across sources", () => {
    const baseBody = WELCOME_V1_BASE_COPY.emailBody;
    expect(baseBody).toContain("{{tenant}}");
    expect(contentTemplate("move-in", WELCOME_ID)?.body).toBe(baseBody);
    expect(mjsTemplate(WELCOME_ID)?.body).toBe(baseBody);
  });

  it("stamps every Approved seed record with the fields the Approved invariant requires", () => {
    const approved = [
      contentTemplate("daily-inbox-triage", "tpl-vendor-ack"),
      contentTemplate("daily-inbox-triage", "tpl-scheduling-ack"),
      contentTemplate("move-in", WELCOME_ID),
      mjsTemplate("tpl-vendor-ack"),
      mjsTemplate("tpl-scheduling-ack"),
      mjsTemplate(WELCOME_ID),
    ];
    for (const record of approved) {
      expect(record?.status).toBe("Approved");
      expect(record?.name).toBeTruthy();
      expect(record?.body).toBeTruthy();
      expect(record?.owner_uid).toBeTruthy();
      expect(record?.approved_by_uid).toBeTruthy();
      expect(record?.last_reviewed_at).toBeTruthy();
    }
  });

  it("keeps the proposed reply pattern as a Draft (not Approved) in both seeds", () => {
    expect(contentTemplate("daily-inbox-triage", "tpl-proposed-portal")?.status).toBe(
      "Draft",
    );
    expect(mjsTemplate("tpl-proposed-portal")?.status).toBe("Draft");
  });

  it("never strips review fields from an Approved seed on re-seed, but still strips Draft ones", () => {
    expect(launchSkeletonDeleteFieldsFor("templates", { status: "Approved" })).toEqual(
      [],
    );
    expect(launchSkeletonDeleteFieldsFor("templates", { status: "Draft" })).toEqual([
      "approved_by_uid",
      "last_reviewed_at",
    ]);
    // Back-compat: called without a record, it defaults to the (Draft) strip list.
    expect(launchSkeletonDeleteFieldsFor("templates")).toEqual([
      "approved_by_uid",
      "last_reviewed_at",
    ]);
  });
});
