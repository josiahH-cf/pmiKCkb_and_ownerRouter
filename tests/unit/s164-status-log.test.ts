import { describe, expect, it } from "vitest";

import type { RenewalWorkStatusActivity } from "@/lib/lease-renewal/work-status";
import {
  RENEWAL_STATUS_NOTE_MAX_LENGTH,
  buildRenewalStatusLog,
  mergeStatusNotes,
  normalizeStatusNoteText,
  type RenewalStatusNote,
} from "@/lib/lease-renewal/work-status-notes";

// S164: the pure Status log model. One list of status changes and notes in recorded order, with the
// recorded actor and time carried through unchanged. Values are synthetic.

function change(
  id: string,
  recordedAt: string,
  overrides: Partial<RenewalWorkStatusActivity> = {},
): RenewalWorkStatusActivity {
  return {
    id,
    leaseId: "701",
    revision: 1,
    previousStatus: null,
    status: "verifying_lease_and_rent",
    recordedAt,
    recordedByUid: "op-1",
    recordedByLabel: "op1@pmikcmetro.com",
    cycleId: null,
    ...overrides,
  };
}

function note(
  noteId: string,
  recordedAt: string,
  overrides: Partial<RenewalStatusNote> = {},
): RenewalStatusNote {
  return {
    schemaVersion: "renewal-status-note/v1",
    leaseId: "701",
    noteId,
    revision: 1,
    text: "Left a voicemail.",
    recordedAt,
    recordedByUid: "op-2",
    recordedByLabel: "op2@pmikcmetro.com",
    updatedAt: recordedAt,
    eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000001",
    ...overrides,
  };
}

describe("S164 status log model", () => {
  it("BEH-S164-5: combines status changes and notes in recorded order with each entry's own actor and time", () => {
    const log = buildRenewalStatusLog(
      [
        change("s-2", "2026-10-02T15:00:00.000Z", {
          revision: 2,
          previousStatus: "verifying_lease_and_rent",
          status: "waiting_on_owner_response",
        }),
        change("s-1", "2026-10-01T15:00:00.000Z"),
      ],
      [
        note("n-2", "2026-10-03T09:00:00.000Z", { text: "Owner replied." }),
        note("n-1", "2026-10-01T16:00:00.000Z"),
      ],
    );
    expect(log.map((entry) => [entry.kind, entry.id, entry.at, entry.byLabel])).toEqual([
      ["status", "s-1", "2026-10-01T15:00:00.000Z", "op1@pmikcmetro.com"],
      ["note", "n-1", "2026-10-01T16:00:00.000Z", "op2@pmikcmetro.com"],
      ["status", "s-2", "2026-10-02T15:00:00.000Z", "op1@pmikcmetro.com"],
      ["note", "n-2", "2026-10-03T09:00:00.000Z", "op2@pmikcmetro.com"],
    ]);
    expect(log[2]).toMatchObject({
      status: "waiting_on_owner_response",
      previousStatus: "verifying_lease_and_rent",
    });
    expect(log[3]).toMatchObject({ text: "Owner replied.", lastSavedAt: null });
  });

  it("BEH-S164-6/BEH-S164-10: a continued note stays one entry at its first save with its first actor, and reports only when it was last saved", () => {
    const first = note("n-1", "2026-10-01T16:00:00.000Z");
    const continued = note("n-1", "2026-10-01T16:00:00.000Z", {
      revision: 3,
      text: "Left a voicemail. Owner called back.",
      updatedAt: "2026-10-04T10:00:00.000Z",
    });
    const merged = mergeStatusNotes([first], [continued]);
    expect(merged).toEqual([continued]);
    // An older answer arriving late never replaces the newer saved text.
    expect(mergeStatusNotes([continued], [first])).toEqual([continued]);
    const log = buildRenewalStatusLog(
      [change("s-1", "2026-10-02T15:00:00.000Z")],
      [continued, continued],
    );
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({
      kind: "note",
      id: "n-1",
      at: "2026-10-01T16:00:00.000Z",
      byUid: "op-2",
      text: "Left a voicemail. Owner called back.",
      lastSavedAt: "2026-10-04T10:00:00.000Z",
    });
    expect(log[1].kind).toBe("status");
  });

  it("BEH-S164-8/BEH-S164-11: empty text is nothing to save, and the text is stored as written without interpretation", () => {
    for (const empty of ["", " ", "\n\t \r\n"])
      expect(normalizeStatusNoteText(empty)).toBeNull();
    expect(normalizeStatusNoteText("  Renewal complete, lease signed.\r\nFiled.  ")).toBe(
      "Renewal complete, lease signed.\nFiled.",
    );
    expect(RENEWAL_STATUS_NOTE_MAX_LENGTH).toBe(4000);
    const log = buildRenewalStatusLog(
      [],
      [note("n-1", "2026-10-01T16:00:00.000Z", { text: "Renewal complete." })],
    );
    expect(log).toEqual([
      {
        kind: "note",
        id: "n-1",
        at: "2026-10-01T16:00:00.000Z",
        byUid: "op-2",
        byLabel: "op2@pmikcmetro.com",
        text: "Renewal complete.",
        lastSavedAt: null,
      },
    ]);
  });
});
