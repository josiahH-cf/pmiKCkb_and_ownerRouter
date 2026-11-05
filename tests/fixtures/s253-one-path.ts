import type { Firestore } from "firebase-admin/firestore";

import {
  type DerivedArtifactDeps,
  type DerivedContext,
} from "@/lib/firestore/lease-derived-artifacts";
import {
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
  packetHeadId,
} from "@/lib/firestore/lease-document-packet-snapshots";
import { catalogFromIntake } from "@/lib/lease-documents/artifact-intake";
import {
  ArtifactIntakeEntrySchema,
  emptyArtifactIntakeManifest,
  type ArtifactFieldMap,
  type ArtifactIntakeManifest,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  ChargePolicyRecordSchema,
  type ChargePolicyRecord,
} from "@/lib/lease-documents/charge-policy";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import {
  nextFamilyUseRecord,
  resolveFamilyUse,
  type FamilyUse,
  type FamilyUseRecord,
} from "@/lib/lease-documents/family-use";
import { packetFormHolds } from "@/lib/lease-documents/form-holds";
import { ApprovedLeaseCatalogSchema } from "@/lib/lease-documents/live-source-schema";
import {
  buildOwnerAcknowledgmentInput,
  ownerAcknowledgmentTransactionId,
} from "@/lib/lease-documents/owner-acknowledgment";
import { assemblePacketSources } from "@/lib/lease-documents/packet-assembly";
import {
  PacketInputsRecordSchema,
  planPacketInputsSave,
  type PacketInputsRecord,
} from "@/lib/lease-documents/packet-inputs";
import { buildPacketInputsView } from "@/lib/lease-documents/packet-inputs-view";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import type {
  LeaseArtifactCatalog,
  LeaseArtifactKind,
  PacketEvaluationInput,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import {
  buildOnePathForms,
  onePathIntakeEntry,
  onePathPacketInputs,
  type OnePathAnimalProfile,
  type OnePathForm,
  type OnePathFormKind,
} from "@/tests/browser/one-path-forms-seed.mjs";
import { admin, op } from "@/tests/fixtures/s130-derived";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

// S253: one synthetic lease built from the rehearsal seed's forms through the same pure steps the
// application runs: the approved intake entries become the catalog, staff saves become packet
// inputs, an Admin's published policy prices the pet, and the packet evaluator decides each form.
// Every name, amount and coordinate is invented.

export const SEEDED_AT = "2026-11-05T15:00:00.000Z";
export const STAFF_AT = "2026-11-05T16:00:00.000Z";
export const CYCLE = "c0000000-0000-4000-8000-000000000253";
export const FEE_SOURCE = "SYNTHETIC source note for the processing fee";
export const DEPOSIT_SOURCE = "SYNTHETIC screening result";

/** The policy an Admin publishes in a check: the fee alone, with its source note. */
export function feeAlonePolicy(amountCents = 5_000, version = 1): ChargePolicyRecord {
  return ChargePolicyRecordSchema.parse({
    schemaVersion: "renewal-charge-policy/v1",
    version,
    effectiveFrom: "2026-11-01",
    content: {
      residentBenefitPackage: null,
      insuranceProgram: null,
      animals: null,
      petProcessingFee: { amountCents, unit: null, source: FEE_SOURCE },
    },
    publishedAt: SEEDED_AT,
    publishedByUid: admin.uid,
  });
}

/** The family-use record after an Admin records each named use, in order. */
export function familyUseRecord(
  uses: ReadonlyArray<readonly [LeaseArtifactKind, FamilyUse]>,
): FamilyUseRecord | null {
  return uses.reduce<FamilyUseRecord | null>(
    (record, [kind, use], index) =>
      nextFamilyUseRecord(
        record,
        {
          kind,
          use,
          expectedVersion: record?.version ?? 0,
          operationId: op(900 + index),
        },
        admin.uid,
        SEEDED_AT,
      ),
    null,
  );
}

export interface OnePathCatalog {
  forms: Record<OnePathFormKind, OnePathForm>;
  manifest: ArtifactIntakeManifest;
  catalog: LeaseArtifactCatalog;
}

/**
 * The approved catalog the application writes from the seeded intake entries once an Admin records
 * a family use. By default the brochure is recorded as required, the seed's one Admin step.
 */
export async function onePathCatalog(
  options: {
    differingPetAgreement?: boolean;
    uses?: ReadonlyArray<readonly [LeaseArtifactKind, FamilyUse]>;
    /** Change a seeded map before it is approved, for a check of a map that should be refused. */
    remap?: Partial<Record<OnePathFormKind, (map: ArtifactFieldMap) => ArtifactFieldMap>>;
  } = {},
): Promise<OnePathCatalog> {
  const forms = await buildOnePathForms({
    differingPetAgreement: options.differingPetAgreement,
  });
  const manifest = emptyArtifactIntakeManifest();
  const entries = { ...manifest.entries };
  for (const form of Object.values(forms)) {
    const entry = ArtifactIntakeEntrySchema.parse({
      ...onePathIntakeEntry(form, SEEDED_AT),
      id: form.kind,
    });
    const remap = options.remap?.[form.kind];
    entries[form.kind] = remap ? { ...entry, fieldMap: remap(entry.fieldMap!) } : entry;
  }
  const record = ApprovedLeaseCatalogSchema.parse(
    catalogFromIntake(
      { ...manifest, entries },
      { approvedByUid: admin.uid, approvedAt: SEEDED_AT },
      resolveFamilyUse(
        familyUseRecord(options.uses ?? [["brokerage_disclosure", "mandatory"]]),
        SEEDED_AT,
      ),
    ),
  );
  return {
    forms,
    manifest: { ...manifest, entries },
    catalog: record.catalog as LeaseArtifactCatalog,
  };
}

export interface OnePathLeaseOptions {
  leaseId?: string;
  tenants?: number;
  animals?: OnePathAnimalProfile;
  /** The deposit staff record for each animal in order, in cents; null records none. */
  deposits?: ReadonlyArray<number | null>;
  /** The explanation staff save for this lease's cycle; absent saves none. */
  explanation?: string;
  cycleId?: string | null;
  /** Further lease facts staff record on this lease, by fact key. */
  facts?: Readonly<Record<string, string | number | boolean>>;
  /** The published policy; null is a lease read before an Admin published anything. */
  policy?: ChargePolicyRecord | null;
  differingPetAgreement?: boolean;
  uses?: ReadonlyArray<readonly [LeaseArtifactKind, FamilyUse]>;
  remap?: Partial<Record<OnePathFormKind, (map: ArtifactFieldMap) => ArtifactFieldMap>>;
}

/** The packet inputs of a seeded lease after the staff saves the options name. */
export function onePathInputs(options: OnePathLeaseOptions = {}): PacketInputsRecord {
  const leaseId = options.leaseId ?? "701";
  let inputs = PacketInputsRecordSchema.parse(
    onePathPacketInputs(
      { leaseId, tenants: options.tenants, animals: options.animals },
      SEEDED_AT,
    ),
  );
  const meta = { actorUid: "synthetic-editor", nowIso: STAFF_AT, eventId: op(800) };
  if (options.deposits?.some((value) => value !== null))
    inputs = planPacketInputsSave(
      inputs,
      {
        leaseId,
        operationId: op(801),
        animals: {
          expectedRevision: inputs.animals.revision,
          entries: inputs.animals.entries.map((animal, index) => {
            const amountCents = options.deposits?.[index] ?? null;
            return amountCents === null
              ? animal
              : { ...animal, deposit: { amountCents, source: DEPOSIT_SOURCE } };
          }),
        },
      },
      meta,
    ).record;
  if (options.explanation !== undefined)
    inputs = planPacketInputsSave(
      inputs,
      {
        leaseId,
        operationId: op(802),
        ownerExplanation: { expectedRevision: 0, text: options.explanation },
      },
      { ...meta, cycleId: options.cycleId === undefined ? CYCLE : options.cycleId },
    ).record;
  const facts = Object.entries(options.facts ?? {});
  if (facts.length)
    inputs = planPacketInputsSave(
      inputs,
      {
        leaseId,
        operationId: op(803),
        facts: facts.map(([fieldKey, value]) => ({
          fieldKey,
          expectedRevision: inputs.facts[fieldKey]?.revision ?? 0,
          value,
        })),
      },
      meta,
    ).record;
  return inputs;
}

/** One lease's tenant and owner evaluation inputs, built the way the live reader builds them. */
export function onePathEvaluationInputs(
  catalog: LeaseArtifactCatalog,
  options: OnePathLeaseOptions = {},
) {
  const leaseId = options.leaseId ?? "701";
  const inputs = onePathInputs(options);
  const policy = options.policy === undefined ? feeAlonePolicy() : options.policy;
  const assembled = assemblePacketSources({
    leaseId,
    mapping: null,
    inputs,
    policy,
    source: { facts: [], parties: [] },
    approvedTermFacts: [],
  });
  const formHolds = packetFormHolds({
    catalog,
    facts: assembled.facts,
    calculated: assembled.calculated,
  });
  const tenant: PacketEvaluationInput = {
    leaseId,
    transactionId: leaseId,
    facts: assembled.facts,
    participants: assembled.participants,
    charges: assembled.charges,
    animals: assembled.animals,
    catalog,
    ...(formHolds.length ? { formHolds } : {}),
  };
  const cycleId = options.cycleId === undefined ? CYCLE : options.cycleId;
  const owner = buildOwnerAcknowledgmentInput({
    tenant,
    inputs,
    cycleId,
    calculated: assembled.calculated,
  });
  return { leaseId, cycleId, inputs, policy, assembled, tenant, owner };
}

/** What the lease's Packet inputs show for a built lease, before anything is prepared. */
export function onePathView(
  built: ReturnType<typeof onePathEvaluationInputs>,
  extra: { startingText?: string; working?: RenewalWorkingRecord | null } = {},
) {
  return buildPacketInputsView({
    record: built.inputs,
    policy: { readable: true, record: built.policy },
    resolved: {
      input: built.tenant,
      calculated: built.assembled.calculated,
      sourceFacts: [],
      sourceParties: [],
      replacedSourceFacts: [],
      ownerApproval: "not_recorded",
      notices: built.assembled.notices,
      workspace: built.cycleId ? { cycleId: built.cycleId } : null,
      working: extra.working ?? null,
      policy: built.policy,
    },
    ...(extra.startingText === undefined ? {} : { startingText: extra.startingText }),
  });
}

function snapshotOf(input: PacketEvaluationInput, snapshotId: string) {
  const evaluation = evaluateRenewalPacket(input);
  const snapshot: RenewalPacketSnapshot = {
    ...evaluation,
    snapshotId,
    snapshotVersion: 1,
    current: true,
    visibleState: evaluation.state,
    createdAt: STAFF_AT,
    actorUid: admin.uid,
    previousSnapshotId: null,
  };
  return snapshot;
}

/**
 * A seeded lease ready for the filled-document store: its tenant packet and its owner
 * acknowledgment saved as current snapshots in a fake Firestore, with the seeded originals served
 * by publication. `prepare` and `status` name a form by its family.
 */
export async function setupOnePathLease(options: OnePathLeaseOptions = {}) {
  const { forms, manifest, catalog } = await onePathCatalog(options);
  const built = onePathEvaluationInputs(catalog, options);
  const { leaseId } = built;
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  const contexts = {
    tenant: {
      input: built.tenant,
      snapshot: snapshotOf(built.tenant, `one-path-tenant-${leaseId}`),
    },
    owner: {
      input: built.owner,
      snapshot: snapshotOf(built.owner, `one-path-owner-${leaseId}`),
    },
  } satisfies Record<string, DerivedContext>;
  for (const [transactionId, context] of [
    [leaseId, contexts.tenant],
    [ownerAcknowledgmentTransactionId(leaseId), contexts.owner],
  ] as const)
    fake.seed(
      `${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId(leaseId, transactionId)}`,
      {
        snapshot_id: context.snapshot.snapshotId,
        payload_hash: context.snapshot.payloadHash,
      },
    );
  const artifactOf = (kind: OnePathFormKind) =>
    catalog.artifacts.find((artifact) => artifact.kind === kind)!;
  const original = async (
    _actor: unknown,
    request: { artifactId?: string; documentRef?: string },
  ) => {
    const artifact = catalog.artifacts.find(
      (entry) =>
        entry.artifactId === request.artifactId ||
        (request.documentRef !== undefined &&
          entry.providerBindings?.dotloopDocumentRef === request.documentRef),
    )!;
    const form = forms[artifact.kind as OnePathFormKind];
    return {
      content: form.bytes,
      fileName: form.fileName,
      contentType: "application/pdf",
    };
  };
  const deps: DerivedArtifactDeps = {
    resolve: async (_actor, _leaseId, snapshotId) =>
      snapshotId === contexts.owner.snapshot.snapshotId
        ? contexts.owner
        : contexts.tenant,
    original: original as DerivedArtifactDeps["original"],
    content: new FirestorePublicationContentStore(db),
    now: () => STAFF_AT,
    attachmentMap: async (artifact) => manifest.entries[artifact.kind]?.fieldMap ?? null,
  };
  const request = (kind: OnePathFormKind) => ({
    leaseId,
    snapshotId: (kind === "owner_acknowledgment" ? contexts.owner : contexts.tenant)
      .snapshot.snapshotId,
    artifactId: artifactOf(kind).artifactId,
  });
  let operations = 0;
  const prepareRequest = (kind: OnePathFormKind) => ({
    ...request(kind),
    action: "prepare",
    operationId: op(++operations),
    expectedCurrentId: null,
  });
  return {
    ...built,
    forms,
    manifest,
    catalog,
    fake,
    db,
    deps,
    contexts,
    artifactOf,
    request,
    prepareRequest,
  };
}
