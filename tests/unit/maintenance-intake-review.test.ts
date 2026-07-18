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
import {
  MAINTENANCE_TEST_PUBLIC_INTAKE,
  MAINTENANCE_TEST_UNIT,
} from "@/lib/maintenance/test-workflow";
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
    data_mode: "live",
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

  it("promotes with an operator-confirmed unit and drops the Needs-Verification label", async () => {
    const db = new FakeFirestore();
    seedIntake(db, "x");
    const ticket = await promoteUnverifiedIntake(
      editor,
      "x",
      { unit: { unitId: "unit:456", label: "123 Main Street Unit 2" } },
      db as unknown as Firestore,
      NOW,
    );

    expect(ticket.unit).toEqual({ unitId: "unit:456", label: "123 Main Street Unit 2" });
    expect(ticket.labels).not.toContain(NEEDS_VERIFICATION_LABEL);

    // The ticket + the flipped intake still land atomically.
    expect(ticketDocs(db)).toHaveLength(1);
    const intake = db.store.get(`${MAINTENANCE_INTAKE_COLLECTIONS.intake}/x`);
    expect(intake).toMatchObject({ status: "promoted", ticket_id: ticket.id });
  });

  it("promotes the canonical Test intake only into the isolated Test ticket", async () => {
    const db = new FakeFirestore();
    seedIntake(db, "test-intake", {
      data_mode: "test",
      property_key: MAINTENANCE_TEST_PUBLIC_INTAKE.propertyKey,
      summary: MAINTENANCE_TEST_PUBLIC_INTAKE.summary,
      description: MAINTENANCE_TEST_PUBLIC_INTAKE.description,
      contact: MAINTENANCE_TEST_PUBLIC_INTAKE.contact,
    });
    const ticket = await promoteUnverifiedIntake(
      editor,
      "test-intake",
      {},
      db as unknown as Firestore,
      NOW,
    );

    expect(ticket).toMatchObject({
      data_mode: "test",
      unit: MAINTENANCE_TEST_UNIT,
      labels: ["TEST DATA"],
      source_trigger_key: "maintenance:test:intake:test-intake",
    });
    expect(ticket.labels).not.toContain(NEEDS_VERIFICATION_LABEL);
    expect(
      db.store.get(`${MAINTENANCE_INTAKE_COLLECTIONS.intake}/test-intake`),
    ).toMatchObject({ data_mode: "test", status: "promoted", ticket_id: ticket.id });
    expect(ticketDocs(db)).toHaveLength(1);
  });

  it("refuses to bind Test intake to any noncanonical unit", async () => {
    const db = new FakeFirestore();
    seedIntake(db, "test-intake", {
      data_mode: "test",
      property_key: MAINTENANCE_TEST_PUBLIC_INTAKE.propertyKey,
    });
    await expect(
      promoteUnverifiedIntake(
        editor,
        "test-intake",
        { unit: { unitId: "unit:live-1", label: "Live unit" } },
        db as unknown as Firestore,
        NOW,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(ticketDocs(db)).toHaveLength(0);
    expect(
      db.store.get(`${MAINTENANCE_INTAKE_COLLECTIONS.intake}/test-intake`),
    ).toMatchObject({ status: "unverified" });
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
