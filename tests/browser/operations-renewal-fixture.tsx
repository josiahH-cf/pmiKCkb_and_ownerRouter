// Synthetic compiled owning-component fixtures. Mounted only in a disposable local checkout.
// No provider adapter, live customer value or deployable fixture route is introduced.
import { PersonalViewProvider } from "@/components/layout/PersonalViewProvider";
import {
  RenewalDeskTable,
  buildDeskPartyFilterOptions,
} from "@/components/lease-renewal/RenewalDeskTable";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import {
  getRenewalDeskView,
  getRenewalLeaseWorkspace,
} from "@/tests/helpers/sample-desk";
import {
  withRenewalDeskQueryKeys,
  normalizeRenewalDeskText,
} from "@/lib/lease-renewal/desk-query";
import {
  applyRenewalDeskQueryV2,
  parseRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";
import { createPartyFilterResolver } from "@/lib/lease-renewal/party-filter-key";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
const cycleId = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const base = getRenewalDeskView().items[0];
function rows(): DeskLeaseRow[] {
  return Array.from({ length: 28 }, (_, i) => {
    const id = String(9001 + i),
      contactId = i < 2 ? "101" : "102",
      label = "Local Person";
    const summary = withRenewalDeskQueryKeys({
      ...base,
      id,
      addressLabel: `Local ${id} Fixture Lane`,
      ownerNameLabels: [label],
      tenantNameLabels: [],
      manualProgress: undefined,
      identity: {
        ...base.identity,
        address: { label: `Local ${id} Fixture Lane`, sourceRef: `test:${id}:address` },
        owners: [
          {
            label,
            sourceRef: `test:${id}:owner`,
            contactId: { label: contactId, sourceRef: `test:${id}:contactID` },
          },
        ],
        tenants: [],
      },
      sourceDestinations: {
        rentvine: {
          kind: "external",
          href: `https://fixture.rentvine.com/manager/leases/${id}`,
          label: "Verified synthetic RentVine destination",
        },
      },
    });
    return {
      ...summary,
      queryKeys: {
        ...summary.queryKeys,
        manualNonRenewal: i === 1,
        dueState: i === 0 ? "due" : "unset",
      },
      guidance: base.guidance,
      processState: null,
    };
  });
}
export async function OperationsRenewalDeskFixture({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const all = rows(),
    state = parseRenewalDeskQueryV2((await searchParams) ?? {}),
    resolver = createPartyFilterResolver(
      { status: "ready", activeKey: Buffer.alloc(32, 7), previousKey: null },
      "renewals",
      all.flatMap((row) =>
        row.identity.owners.map((p) => ({
          partyKind: "owner" as const,
          normalizedLabel: normalizeRenewalDeskText(p.label),
          sourceId: p.contactId!.label,
        })),
      ),
    );
  const filtered = applyRenewalDeskQueryV2(all, state, resolver.matches)
    .items as DeskLeaseRow[];
  return (
    <PersonalViewProvider accountId="local-fixture" canSave>
      <main className="content content--workspace">
        <h1>Local operations worklist fixture</h1>
        <RenewalDeskTable
          rows={filtered}
          totalLoaded={all.length}
          sourceReadOk
          sourceReadComplete
          dependentStateComplete
          role="Admin"
          state={state}
          shortcuts={resolver}
          partyOptions={buildDeskPartyFilterOptions(all, resolver)}
        />
      </main>
    </PersonalViewProvider>
  );
}
export async function OperationsRenewalLeaseFixture({
  params,
}: Readonly<{ params: Promise<{ leaseId: string }> }>) {
  const { leaseId } = await params,
    original = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
  const manual = emptyRenewalWorkspace(leaseId, cycleId, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "Synthetic source lease end",
  });
  const summary = {
    ...original.summary,
    id: leaseId,
    addressLabel: `Local ${leaseId} Fixture Lane`,
    tenantNameLabel: "Local Tenant",
    tenantNameLabels: ["Local Tenant"],
  };
  const workspace = {
    ...original,
    summary,
    dataCurrency: {
      state: "fresh" as const,
      readAtIso: new Date().toISOString(),
      ageMs: 0,
      refreshing: false,
      lastError: false,
    },
    live: {
      leaseId,
      ownerDecision: null,
      ownerDecisionCurrent: false,
      ownerOutcome: null,
      ownerResponseRecordable: false,
      tenantOfferDraftId: null,
      tenantOutcome: null,
      processVersion: "renewal-v1",
      complete: false,
    },
  };
  const notes = Array.from({ length: 8 }, (_, i) => ({
    schemaVersion: "renewal-status-note/v1" as const,
    leaseId,
    noteId: `3c5e7a90-1d2f-4b6a-9c8e-${String(i + 1).padStart(12, "0")}`,
    revision: 1,
    text: `Local prior activity ${i + 1}`,
    recordedAt: `2026-10-0${i + 1}T12:00:00Z`,
    updatedAt: `2026-10-0${i + 1}T12:00:00Z`,
    recordedByUid: "fixture-staff",
    recordedByLabel: "fixture-staff@pmikcmetro.com",
    cycleId: null,
    eventId: `0f1c8f6e-6d1c-4bd3-9d7a-${String(i + 1).padStart(12, "0")}`,
  }));
  return (
    <PersonalViewProvider accountId="local-fixture" canSave>
      <main className="content content--workspace">
        <RenewalWorkspace
          role="Editor"
          workspace={workspace}
          manualState={manual}
          manualCycleBasis={{
            kind: "lease_end",
            dateIso: "2026-12-31",
            source: "Synthetic source lease end",
          }}
          workStatus={{
            available: true,
            record: null,
            history: [],
            notes,
            currentCycleId: cycleId,
          }}
        />
      </main>
    </PersonalViewProvider>
  );
}
