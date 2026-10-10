import { MaintenanceOperatingPolicies } from "@/components/maintenance/MaintenanceOperatingPolicies";
import { PresentationSettingsPanel } from "@/components/admin/PresentationSettingsPanel";
import { Suspense } from "react";
// Disposable-project adapters only; actual capture/queue, HTTP handlers, ticket store and lifecycle.
import assert from "node:assert/strict";
import { AppShell } from "@/components/layout/AppShell";
import { MaintenanceHistoryReports } from "@/components/maintenance/MaintenanceHistoryReports";
import { MaintenanceVendorRoster } from "@/components/maintenance/MaintenanceVendorRoster";
import { VendorWorkWorkspace } from "@/components/vendor/VendorWorkWorkspace";
import { FirestoreVendorStore } from "@/lib/firestore/vendors";
import { requireAssignedTicket } from "@/lib/vendor/assignment";
import { MaintenanceCapture } from "@/components/maintenance/MaintenanceCapture";
import { MaintenanceQueue } from "@/components/maintenance/MaintenanceQueue";
import { MaintenanceTicketProvider } from "@/components/maintenance/MaintenanceTicketProvider";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  listMaintenanceTickets,
  MAINTENANCE_TICKET_COLLECTIONS as C,
} from "@/lib/firestore/maintenance-tickets";
import type { UnitSourceOutcome } from "@/lib/maintenance/live-unit-source";
import type { AuthenticatedUser } from "@/lib/auth/session";
assert.match(process.cwd(), /^\/tmp\/pmi-kc-operations-browser-[^/]+\/worktree$/);
assert.equal(process.env.OPERATIONS_BROWSER_FIXTURE, "true");
assert.equal(process.env.FIREBASE_PROJECT_ID, "pmi-kc-kb-operations-browser-test");
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const actor: AuthenticatedUser = {
  uid: "browser-maintenance-staff",
  email: "browser-maintenance-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const global = globalThis as unknown as Record<symbol, { failed: boolean }>,
  key = Symbol.for("pmi-kc-maintenance-browser-fixture"),
  state = global[key] ?? (global[key] = { failed: false });
export async function requireCapabilityInSpace(...args: unknown[]) {
  void args;
  return actor;
}
export async function isAssignableUser(uid: string) {
  return uid === actor.uid;
}
export async function loadLiveUnitCandidates(): Promise<UnitSourceOutcome> {
  return state.failed
    ? { status: "read_error" as const }
    : {
        status: "ok" as const,
        candidates: [
          { unitId: "unit:801", label: "Local 801 Fixture Lane", propertyId: "901" },
        ],
        skipped: 0,
      };
}
export async function unitsGET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
  return state.failed
    ? Response.json({ error: "Local source unavailable" }, { status: 503 })
    : Response.json({
        units:
          q && "local 801 fixture lane".includes(q)
            ? [{ unitId: "unit:801", label: "Local 801 Fixture Lane" }]
            : [],
      });
}
export async function SurfaceFixture({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string>> }>) {
  const params = (await searchParams) ?? {},
    tickets = await listMaintenanceTickets(actor);
  return (
    <AppShell user={actor}>
      <main className="content">
        <h1>Maintenance</h1>
        <MaintenanceTicketProvider initialTickets={tickets}>
          <MaintenanceCapture reporterUid={actor.uid} />
          <MaintenanceQueue
            initialTickets={tickets}
            currentUid={actor.uid}
            canEdit
            focusedTicketId={params.ticket_id}
          />
        </MaintenanceTicketProvider>
      </main>
    </AppShell>
  );
}
export async function controlPOST(request: Request) {
  const input = await request.json();
  if (typeof input.failed === "boolean") state.failed = input.failed;
  const db = getAdminFirestore();
  if (input.action === "seedVendor") {
    const at = new Date().toISOString();
    await db
      .collection("vendors")
      .doc(vendor.vendorId)
      .set({
        id: vendor.vendorId,
        uid: vendor.uid,
        email: vendor.email,
        status: "active",
        inviteVersion: 1,
        displayName: "Local Fixture Plumbing",
        data_mode: "live",
        createdAt: at,
        updatedAt: at,
        identityState: { emailVerified: true, totpRequired: true, totpVerified: true },
      });
    await db.collection("vendor_ticket_assignments").doc(input.ticketId).set({
      ticket_id: input.ticketId,
      vendor_id: vendor.vendorId,
      active: true,
      data_mode: "live",
      updated_at: at,
    });
    await db.collection(C.tickets).doc(input.ticketId).update({
      vendor_id: vendor.vendorId,
      description: "PRIVATE STAFF DISCUSSION MUST NOT REACH VENDOR",
    });
  }
  if (input.action === "revokeVendor")
    await db
      .collection("vendor_ticket_assignments")
      .doc(input.ticketId)
      .update({ active: false, updated_at: new Date().toISOString() });
  const names = [
      C.tickets,
      C.activity,
      C.creationIntents,
      C.operations,
      "action_executions",
      "workflow_communication_sequences",
      "maintenance_case_events",
      "maintenance_financial_entries",
      "maintenance_retained_artifacts",
      "maintenance_vendor_contributions",
      "maintenance_vendor_artifacts",
      "maintenance_vendor_roster",
      "maintenance_vendor_packets",
      "maintenance_report_snapshots",
    ],
    counts = Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [name, (await db.collection(name).get()).size]),
      ),
    );
  return Response.json({ counts, tickets: await listMaintenanceTickets(actor) });
}

const vendor = {
  uid: "browser-vendor-uid",
  vendorId: "browser-vendor",
  email: "browser-vendor@fixture.invalid",
  emailVerified: true as const,
  totpVerified: true as const,
  sessionIssuedAt: Date.now(),
  dataMode: "live" as const,
};
export async function requireVendorSession() {
  return vendor;
}
export async function verifyMaintenanceCaseAssociation(input: {
  kind: string;
  propertyId: string | null;
  unitId: string | null;
  leaseId: string | null;
}) {
  assert.ok(
    input.kind === "unresolved" ||
      (input.propertyId === "901" &&
        input.unitId === "801" &&
        (!input.leaseId || input.leaseId === "701")),
  );
  return {
    unitLabel: input.kind === "unresolved" ? null : "Local 801 Fixture Lane",
    sourceHash: "a".repeat(64),
  };
}
export async function VendorSurfaceFixture({
  params,
}: Readonly<{ params: Promise<{ ticketId: string }> }>) {
  const ticket = await requireAssignedTicket(
    vendor,
    (await params).ticketId,
    new FirestoreVendorStore(),
  );
  return (
    <main className="content">
      <h1>{ticket.summary}</h1>
      <VendorWorkWorkspace initialTicket={ticket} actorUid={vendor.uid} />
    </main>
  );
}
export async function RosterSurfaceFixture() {
  return (
    <AppShell user={actor}>
      <main className="content">
        <h1>Maintenance vendors</h1>
        <Suspense fallback={<p>Loading vendors…</p>}>
          <MaintenanceVendorRoster actorUid={actor.uid} canManage />
        </Suspense>
      </main>
    </AppShell>
  );
}

export type { VerifiedMaintenanceAssociation } from "@/lib/maintenance/case-source";

export async function ReportSurfaceFixture({
  searchParams,
}: {
  searchParams?: Promise<{ report_id?: string }>;
}) {
  return (
    <AppShell user={actor}>
      <main className="content">
        <MaintenanceHistoryReports
          actorUid={actor.uid}
          canEdit
          initialMonth="2026-10"
          initialReportId={(await searchParams)?.report_id}
        />
      </main>
    </AppShell>
  );
}

export async function requireCapability(...args: unknown[]) {
  void args;
  return actor;
}
export async function verifyExistingStaff(uid: string) {
  if (uid !== actor.uid) throw Error("Unknown local fixture staff identity");
  return {
    uid: actor.uid,
    email: actor.email,
    emailVerified: true,
    disabled: false,
    customClaims: { role: actor.role },
  };
}
export async function PolicySurfaceFixture() {
  return (
    <AppShell user={actor}>
      <main className="content stack">
        <h1>Maintenance operating policies</h1>
        <Suspense fallback={<p>Loading policy controls</p>}>
          <MaintenanceOperatingPolicies actorUid={actor.uid} canManage />
        </Suspense>
      </main>
    </AppShell>
  );
}
export async function PresentationSurfaceFixture() {
  return (
    <AppShell user={actor}>
      <main className="content stack">
        <h1>Business profiles and application name</h1>
        <PresentationSettingsPanel kind="profile" uid={actor.uid} />
        <PresentationSettingsPanel kind="display" />
      </main>
    </AppShell>
  );
}
