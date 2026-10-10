// Guarded synthetic source/auth adapters; actual AppShell, search index, routes and app stores.
import assert from "node:assert/strict";
import { AppShell } from "@/components/layout/AppShell";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { createMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { VENDOR_COLLECTIONS } from "@/lib/firestore/vendors";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { RawLease } from "@/lib/integrations/rentvine/client";
assert.match(process.cwd(), /^\/tmp\/pmi-kc-operations-browser-[^/]+\/worktree$/);
assert.equal(process.env.OPERATIONS_BROWSER_FIXTURE, "true");
assert.equal(process.env.FIREBASE_PROJECT_ID, "pmi-kc-kb-operations-browser-test");
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const actor: AuthenticatedUser = {
  uid: "browser-search-staff",
  email: "browser-search-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
interface State {
  seed: Promise<void> | null;
  ticketId: string | null;
  failed: boolean;
  removed: boolean;
}
const global = globalThis as unknown as Record<symbol, State>,
  key = Symbol.for("pmi-kc-operations-search-fixture"),
  state =
    global[key] ??
    (global[key] = { seed: null, ticketId: null, failed: false, removed: false });
export async function requireCapability(...args: unknown[]) {
  void args;
  await seed();
  return actor;
}
export async function requirePageCapability(...args: unknown[]) {
  void args;
  await seed();
  return actor;
}
export function buildLiveRentVineConfig(...args: unknown[]) {
  void args;
  return { ok: true, rentvineClient: {} };
}
function views(): RawLease[] {
  return [
    {
      leaseID: 701,
      unit: { unitID: 801, address: "East 123 Fixture Lane" },
      property: {
        propertyID: 901,
        name: "Miller property",
        owners: [{ contactID: 101, name: "Miller owner" }],
      },
      tenants: [{ contactID: 201, name: "Miller resident" }],
    },
    {
      leaseID: 702,
      unit: { unitID: 802, address: "East 168 Fixture Lane" },
      property: {
        propertyID: 902,
        name: "Other property",
        owners: [{ contactID: 102, name: "Miller owner" }],
      },
    },
    ...Array.from({ length: 61 }, (_, i) => ({
      leaseID: 1000 + i,
      address: `Miller fixture ${String(i).padStart(2, "0")}`,
    })),
  ].filter((v) => !state.removed || v.leaseID !== 701);
}
export async function readCoherentRenewalDisplaySource(...args: unknown[]) {
  void args;
  await seed();
  if (state.failed) throw Error("PRIVATE_PROVIDER_BODY");
  return {
    snapshot: {
      views: views(),
      complete: true,
      readAtMs: Date.parse("2026-10-09T15:00:00Z"),
    },
    currency: { state: "fresh" },
  };
}
async function seed() {
  state.seed ??= (async () => {
    const db = getAdminFirestore(),
      ticket = await createMaintenanceTicket(
        actor,
        {
          summary: "Miller dripping fixture",
          description: "PRIVATE_TICKET_BODY",
          priority: "Normal",
          unit: {
            unitId: "unit:801",
            label: "East 123 Fixture Lane",
            confidence: "Verified",
          },
        },
        db,
        "901",
      );
    state.ticketId = ticket.id;
    await db.collection(VENDOR_COLLECTIONS.vendors).doc("vendor-1").set({
      id: "vendor-1",
      uid: "vendor-one",
      email: "vendor@example.invalid",
      status: "active",
      displayName: "Miller Plumbing",
      data_mode: "live",
      inviteVersion: 1,
      createdAt: "2026-10-09T15:00:00Z",
      updatedAt: "2026-10-09T15:00:00Z",
    });
  })();
  await state.seed;
}
export async function SurfaceFixture({
  title = "Dashboard",
}: Readonly<{ title?: string }>) {
  await seed();
  return (
    <AppShell user={actor}>
      <main className="content">
        <h1>{title}</h1>
        <label className="field">
          Unsaved local note
          <textarea defaultValue="Words kept in the starting workspace" />
        </label>
        <p>
          Local source/auth adapter. The search control and record resolver are compiled
          application code.
        </p>
      </main>
    </AppShell>
  );
}
export async function DestinationFixture({
  params,
  searchParams,
}: Readonly<{
  params?: Promise<Record<string, string>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const q = (await searchParams) ?? {},
    p = (await params) ?? {};
  return (
    <AppShell user={actor}>
      <main className="content">
        <h1>Local record destination</h1>
        <p>Selected lease {p.leaseId ?? ""}</p>
        <p>Selected ticket {q.ticket_id ?? ""}</p>
        <p>Related lease filter {q.ownerKey ?? q.tenantKey ?? ""}</p>
        <p>Source-backed destination adapters preserve the verified route and query.</p>
      </main>
    </AppShell>
  );
}
export async function controlPOST(request: Request) {
  const input = await request.json();
  await seed();
  if (typeof input.failed === "boolean") state.failed = input.failed;
  if (typeof input.removed === "boolean") state.removed = input.removed;
  return Response.json({ ticketId: state.ticketId });
}
