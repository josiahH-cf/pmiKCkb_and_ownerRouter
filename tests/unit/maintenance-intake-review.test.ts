import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

import {
  NEEDS_VERIFICATION_LABEL,
  dismissUnverifiedIntake,
  listUnverifiedIntake,
  promoteUnverifiedIntake,
} from "@/lib/firestore/maintenance-intake-review";
import { MAINTENANCE_INTAKE_COLLECTIONS } from "@/lib/firestore/maintenance-unverified-intake";
import { MAINTENANCE_TICKET_COLLECTIONS } from "@/lib/firestore/maintenance-tickets";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const NOW = Date.parse("2026-07-10T09:00:00.000Z");

const editor: AuthenticatedUser = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-1",
};

function seedIntake(
  db: FakeFirestore,
  id: string,
  overrides: Record<string, unknown> = {},
) {
  db.seed(`${MAINTENANCE_INTAKE_COLLECTIONS.intake}/${id}`, {
    id,
    status: "unverified",
    source: "public-link",
    property_key: "prop-1",
    summary: "Water heater leaking",
    description: "Emergency: flooding the closet",
    contact: "tenant@example.com",
    reporter_kind: "external",
    ip_hash: "iphash",
    created_at: "2026-07-09T12:00:00.000Z",
    expires_at: "2026-10-07T12:00:00.000Z",
    ...overrides,
  });
}

function ticketDocs(db: FakeFirestore): MaintenanceTicketRecord[] {
  return [...db.store.entries()]
    .filter(
      ([path]) =>
        path.startsWith(`${MAINTENANCE_TICKET_COLLECTIONS.tickets}/`) &&
        !path.slice(`${MAINTENANCE_TICKET_COLLECTIONS.tickets}/`.length).includes("/"),
    )
    .map(([, data]) => data as unknown as MaintenanceTicketRecord);
}

describe("maintenance intake review", () => {
  it("lists only the requested status bucket, newest first", async () => {
    const db = new FakeFirestore();
    seedIntake(db, "a", { created_at: "2026-07-08T00:00:00.000Z" });
    seedIntake(db, "b", { created_at: "2026-07-09T00:00:00.000Z" });
    seedIntake(db, "c", { status: "dismissed" });
    const list = await listUnverifiedIntake(
      editor,
      "unverified",
      db as unknown as Firestore,
    );
    expect(list.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("promotes an intake into an external, Needs-Verification ticket and flips it atomically", async () => {
    const db = new FakeFirestore();
    seedIntake(db, "x");
    const ticket = await promoteUnverifiedIntake(
      editor,
      "x",
      {},
      db as unknown as Firestore,
      NOW,
    );

    expect(ticket.status).toBe("Open");
    expect(ticket.reporter).toEqual({ kind: "external", contact: "tenant@example.com" });
    expect(ticket.unit).toBeNull();
    expect(ticket.labels).toContain(NEEDS_VERIFICATION_LABEL);
    // "Emergency:" in the text drives the inferred priority (transparent provenance).
    expect(ticket.priority).toBe("Emergency");
    expect(ticket.priority_provenance).toBe("auto-inferred");
    expect(ticket.source_trigger_key).toBe("maintenance:intake:x");

    // The ticket + its activity + the flipped intake all landed.
    expect(ticketDocs(db)).toHaveLength(1);
    const intake = db.store.get(`${MAINTENANCE_INTAKE_COLLECTIONS.intake}/x`);
    expect(intake).toMatchObject({
      status: "promoted",
      reviewed_by: "editor-1",
      ticket_id: ticket.id,
    });
  });

  it("honors an operator priority override (operator-set provenance)", async () => {
    const db = new FakeFirestore();
    seedIntake(db, "x", { description: "minor drip" });
    const ticket = await promoteUnverifiedIntake(
      editor,
      "x",
      { priority: "Low" },
      db as unknown as Firestore,
      NOW,
    );
    expect(ticket.priority).toBe("Low");
    expect(ticket.priority_provenance).toBe("operator-set");
  });

  it("refuses to promote a missing intake (404) or an already-triaged one (409)", async () => {
    const db = new FakeFirestore();
    await expect(
      promoteUnverifiedIntake(editor, "nope", {}, db as unknown as Firestore, NOW),
    ).rejects.toMatchObject({ status: 404 });

    seedIntake(db, "y", { status: "promoted" });
    await expect(
      promoteUnverifiedIntake(editor, "y", {}, db as unknown as Firestore, NOW),
    ).rejects.toMatchObject({ status: 409 });
    // No second ticket was created.
    expect(ticketDocs(db)).toHaveLength(0);
  });

  it("dismisses an intake with a required reason and records it", async () => {
    const db = new FakeFirestore();
    seedIntake(db, "z");
    const dismissed = await dismissUnverifiedIntake(
      editor,
      "z",
      { reason: "Duplicate of ticket 42" },
      db as unknown as Firestore,
      NOW,
    );
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.dismiss_reason).toBe("Duplicate of ticket 42");
    expect(ticketDocs(db)).toHaveLength(0);
  });

  it("rejects a blank dismiss reason (schema validation)", async () => {
    const db = new FakeFirestore();
    seedIntake(db, "z");
    await expect(
      dismissUnverifiedIntake(
        editor,
        "z",
        { reason: "   " },
        db as unknown as Firestore,
        NOW,
      ),
    ).rejects.toThrow();
    // The intake is untouched.
    expect(db.store.get(`${MAINTENANCE_INTAKE_COLLECTIONS.intake}/z`)).toMatchObject({
      status: "unverified",
    });
  });
});
