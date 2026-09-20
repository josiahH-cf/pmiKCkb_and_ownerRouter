import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { projectMessageReadiness } from "@/lib/lease-renewal/message-readiness";
import {
  MESSAGE_PATH_EVIDENCE_MATRIX,
  PENDING_MEETING_ITEMS,
  projectMessagePreflight,
  type MessagePreflightInput,
} from "@/lib/lease-renewal/message-preflight";

// S129 (F09): the preflight is a read-only projection over the same inputs the preparation uses.
// It distinguishes technically tested composition from unavailable live input and keeps the
// human observations Pending meeting. Every value is synthetic; nothing reads a provider.

function ready(overrides: Partial<MessagePreflightInput> = {}): MessagePreflightInput {
  return {
    channel: "tenant",
    canEdit: true,
    senderEmail: "fixture-staff@pmikcmetro.com",
    cycleId: "cycle-1",
    saved: true,
    dirty: false,
    needsReview: false,
    signatureOrigin: "saved",
    signatureMatchesActor: true,
    readiness: projectMessageReadiness({
      channel: "tenant",
      missing: [],
      saved: true,
      dirty: false,
      needsReview: false,
      signatureMatchesActor: true,
      signatureSaved: true,
    }),
    recipients: {
      status: "ready",
      to: "tenant@fixture.invalid",
      cc: ["staff@fixture.invalid"],
    },
    publication: { status: "approved", ref: "supplied:tenant:v2" },
    gmailDestination: true,
    draftAttempt: null,
    notices: [],
    loadedAtIso: "2026-09-20T15:00:00.000Z",
    ...overrides,
  };
}

const state = (result: ReturnType<typeof projectMessagePreflight>, id: string) =>
  result.items.find((item) => item.id === id)?.state;

describe("S129 evidence matrix (AC-S129-1)", () => {
  it("ties every user-visible step to a current control, service and deterministic check that exist", () => {
    expect(MESSAGE_PATH_EVIDENCE_MATRIX.length).toBeGreaterThanOrEqual(9);
    for (const row of MESSAGE_PATH_EVIDENCE_MATRIX) {
      const paths = [
        row.control,
        row.service,
        ...row.tests,
        ...("route" in row ? [row.route] : []),
      ];
      for (const path of paths)
        expect(existsSync(resolve(process.cwd(), path)), path).toBe(true);
      expect(row.tests.length).toBeGreaterThan(0);
    }
    const steps = MESSAGE_PATH_EVIDENCE_MATRIX.map((row) => row.step.toLowerCase());
    for (const needle of [
      "compose",
      "missing input",
      "recipients",
      "signature",
      "confirm",
      "recover",
      "preflight",
    ])
      expect(
        steps.some((step) => step.includes(needle)),
        needle,
      ).toBe(true);
  });
});

describe("S129 meeting preflight (AC-S129-7)", () => {
  it("proceeds through preparation with Gmail unavailable and keeps the unsent-draft step pending", () => {
    const offline = projectMessagePreflight(
      ready({
        gmailDestination: false,
        publication: { status: "unavailable", reason: "Publication readback pending." },
      }),
    );
    expect(offline.proceedWithoutGmail).toBe(true);
    expect(offline.draftStepAvailable).toBe(false);
    expect(state(offline, "gmail_connection")).toBe("unavailable");
    expect(state(offline, "template")).toBe("unavailable");
    expect(
      offline.items.find((item) => item.id === "gmail_connection")?.fallback,
    ).toMatch(/Copy the reviewed/);
    expect(offline.items.find((item) => item.id === "gmail_connection")?.target).toEqual({
      kind: "route",
      href: "/connections",
    });
    expect(offline.summary).toMatch(
      /Preparation can proceed without Gmail; the unsent-draft step stays pending/,
    );
    const pending = offline.items.filter((item) => item.state === "pending_meeting");
    expect(pending.map((item) => item.id)).toEqual([
      "meeting_lease",
      "meeting_mailbox",
      "meeting_draft",
    ]);
    expect(pending.every((item) => /Not observed/.test(item.detail))).toBe(true);
    expect(PENDING_MEETING_ITEMS.every((item) => item.state === "pending_meeting")).toBe(
      true,
    );
    expect(JSON.stringify(offline)).not.toMatch(/\bsent\b|\bvalidated\b|\bPASS\b/);
  });

  it("marks the draft step available only when every technical item is ready, and still needs a person", () => {
    const all = projectMessagePreflight(ready());
    expect(all.draftStepAvailable).toBe(true);
    expect(all.counts.pending_meeting).toBe(3);
    expect(all.counts.ready).toBe(all.items.length - 3);
    expect(all.summary).toMatch(/attempted on explicit confirmation/);
    expect(all.items.find((item) => item.id === "source_read")?.detail).toMatch(
      /09\/20\/2026, 10:00 AM CDT/,
    );
  });

  it("names each missing or unavailable technical item with its control or fallback", () => {
    const readiness = projectMessageReadiness({
      channel: "owner",
      missing: [
        { field: "range", message: "Record the reviewed range." },
        { field: "comps", message: "Add the reviewed comps." },
      ],
      saved: false,
      dirty: true,
      needsReview: true,
      signatureMatchesActor: false,
      signatureSaved: false,
    });
    const result = projectMessagePreflight(
      ready({
        channel: "owner",
        canEdit: false,
        cycleId: null,
        saved: false,
        dirty: true,
        needsReview: true,
        signatureOrigin: "retained_sender",
        readiness,
        recipients: { status: "blocked", reasons: ["No owner email is recorded."] },
        draftAttempt: { state: "Needs reconciliation", recoveryAvailable: true },
        notices: ["Move-out evidence unknown."],
        loadedAtIso: null,
      }),
    );
    expect(result.proceedWithoutGmail).toBe(false);
    expect(result.draftStepAvailable).toBe(false);
    expect(state(result, "source_read")).toBe("unavailable");
    expect(state(result, "cycle")).toBe("missing_input");
    expect(result.items.find((item) => item.id === "cycle")?.target).toEqual({
      kind: "control",
      id: "renewal-manual-cycle",
    });
    const inputs = result.items.find((item) => item.id === "required_inputs");
    expect(inputs).toMatchObject({
      state: "missing_input",
      target: { kind: "control", id: "renewal-message-owner-readiness" },
    });
    expect(inputs?.detail).toMatch(/2 inputs remain: Market evidence: comp preparation/);
    expect(result.items.find((item) => item.id === "review")).toMatchObject({
      state: "missing_input",
      detail: "Unsaved edits differ from the saved record.",
    });
    expect(result.items.find((item) => item.id === "signature")).toMatchObject({
      state: "not_verified",
      target: { kind: "control", id: "renewal-message-owner-signature-name" },
    });
    expect(result.items.find((item) => item.id === "recipients")).toMatchObject({
      state: "unavailable",
      detail: "No owner email is recorded.",
    });
    expect(result.items.find((item) => item.id === "permitted_action")).toMatchObject({
      state: "unavailable",
      fallback: "Ask an Editor to review and create the draft.",
    });
    expect(result.items.find((item) => item.id === "attempt_recovery")).toMatchObject({
      state: "not_verified",
    });
    expect(result.items.find((item) => item.id === "notice_1")).toMatchObject({
      state: "not_verified",
      detail: "Move-out evidence unknown.",
    });
    expect(result.summary).toMatch(
      /Resolve the listed items before the unsent-draft step/,
    );
    const another = projectMessagePreflight(
      ready({ signatureOrigin: "saved", signatureMatchesActor: false }),
    );
    expect(another.items.find((item) => item.id === "signature")).toMatchObject({
      state: "missing_input",
      target: { kind: "control", id: "renewal-message-tenant-adopt-signature" },
    });
  });
});
