import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  LOOP_ASSOCIATION_COLLECTIONS,
  completeLoopCreation,
  linkExistingLoop,
  planLoopCreationClaim,
  planUploadClaim,
  readLoopAssociation,
  recordLoopFolder,
  recordLoopUpload,
  reviewedLoopHash,
  unlinkLeaseLoop,
  type ReviewedLoopObservation,
} from "@/lib/firestore/lease-document-loop-association";
import {
  documentUploadPlan,
  loopOwnerDocId,
  propertyAddressValue,
  usableLoopTarget,
  type LoopAssociation,
} from "@/lib/lease-documents/dotloop-loop-association";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

// S34 (ARCH-S34-2, AC-S34-2/5/6/7/10): the lease's one loop target, separate from packet
// snapshots. Every value is synthetic; no provider is constructed.

const editor = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as AuthenticatedUser;
const NOW = "2026-10-06T12:00:00.000Z";
const hash = (c: string) => c.repeat(64);

function observation(loopId = "5001"): ReviewedLoopObservation {
  return {
    profileId: "profile-1",
    loopId,
    name: `SYNTHETIC loop ${loopId}`,
    status: "PRE_OFFER",
    loopUrl: `https://www.dotloop.com/m/loop/${loopId}`,
    participantCount: 2,
    participants: [
      { fullName: "Synthetic Tenant", email: "tenant@example.test", role: "TENANT" },
    ],
  };
}

function setup() {
  const fake = new FakeFirestore();
  return { fake, db: fake as unknown as Firestore };
}

const link = (
  db: Firestore,
  overrides: Partial<Parameters<typeof linkExistingLoop>[1]> = {},
) =>
  linkExistingLoop(
    editor,
    {
      leaseId: "701",
      cycleId: "cycle-2027",
      observation: observation(),
      reason: "Reviewed the lease loop",
      expectedLinkRevision: 0,
      reuseAcrossCycles: false,
      ...overrides,
    },
    db,
    NOW,
  );

beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
});
afterEach(() => vi.unstubAllEnvs());

describe("S34 loop association model", () => {
  it("plans uploads by exact version: reused, successor or new, keeping every earlier upload", () => {
    const uploaded = (contentHash: string, uploadedAt: string) => ({
      artifactId: "a",
      documentRef: "doc-a",
      label: "Renewal",
      contentHash,
      snapshotId: "s",
      derivedArtifactId: null,
      receiptId: `r-${contentHash[0]}`,
      dotloopDocumentId: "d",
      dotloopFolderId: "f",
      documentName: "renewal.pdf",
      uploadedAt,
      uploadedByUid: "editor-1",
      supersedesContentHash: null,
    });
    const association = {
      documents: [
        uploaded(hash("1"), "2026-10-01T00:00:00Z"),
        uploaded(hash("2"), "2026-10-02T00:00:00Z"),
      ],
    };
    const plan = documentUploadPlan(association, [
      { artifactId: "a", documentRef: "doc-a", label: "Renewal", contentHash: hash("2") },
      { artifactId: "b", documentRef: "doc-b", label: "Pet", contentHash: hash("3") },
    ]);
    expect(plan.map((entry) => entry.status)).toEqual([
      "uploaded_current",
      "not_uploaded",
    ]);
    expect(plan[0].history.map((entry) => entry.contentHash)).toEqual([
      hash("1"),
      hash("2"),
    ]);
    const changed = documentUploadPlan(association, [
      { artifactId: "a", documentRef: "doc-a", label: "Renewal", contentHash: hash("4") },
    ]);
    expect(changed[0]).toMatchObject({
      status: "successor_needed",
      latestUpload: { contentHash: hash("2") },
    });
    expect(propertyAddressValue(null)).toBe("none");
    expect(
      propertyAddressValue({
        streetName: "1 Main St",
        city: "Kansas City",
        state: "MO",
        zip: "64105",
      }),
    ).toBe("1 Main St | Kansas City | MO | 64105");
  });
});

describe("S34 linking an existing loop (AC-S34-5, AC-S34-10)", () => {
  it("links a reviewed loop, refuses another lease's loop and reuse without confirmation, and corrects only the app link", async () => {
    const { fake, db } = setup();
    const linked = await link(db);
    expect(linked).toMatchObject({
      state: "current",
      origin: "linked_existing",
      loopId: "5001",
      linkRevision: 1,
      createExecutionId: null,
    });
    expect(usableLoopTarget(linked, "cycle-2027")).toBe(true);
    expect(usableLoopTarget(linked, "cycle-2028")).toBe(false);
    expect(
      fake.store.get(
        `${LOOP_ASSOCIATION_COLLECTIONS.owners}/${loopOwnerDocId("profile-1", "5001")}`,
      ),
    ).toMatchObject({ leaseId: "701", cycleIds: ["cycle-2027"] });

    // Another lease cannot link a loop recorded for this one.
    await expect(
      linkExistingLoop(
        editor,
        {
          leaseId: "702",
          cycleId: "cycle-x",
          observation: observation(),
          reason: "Wrong lease",
          expectedLinkRevision: 0,
          reuseAcrossCycles: false,
        },
        db,
        NOW,
      ),
    ).rejects.toThrow(/recorded for a different lease/);
    // A second loop needs the current link corrected first; a stale page refuses.
    await expect(
      link(db, { observation: observation("5002"), expectedLinkRevision: 1 }),
    ).rejects.toThrow(/already has a current Dotloop loop/);
    await expect(link(db, { expectedLinkRevision: 0 })).rejects.toThrow(/changed since/);
    await expect(link(db, { expectedLinkRevision: 1 })).rejects.toThrow(/already linked/);

    // A new cycle of the same lease reuses the loop only when staff confirm it.
    await expect(
      link(db, { cycleId: "cycle-2028", expectedLinkRevision: 1 }),
    ).rejects.toThrow(/earlier renewal cycle/);
    const reused = await link(db, {
      cycleId: "cycle-2028",
      expectedLinkRevision: 1,
      reuseAcrossCycles: true,
    });
    expect(reused).toMatchObject({
      cycleId: "cycle-2028",
      priorCycleIds: ["cycle-2027"],
      linkRevision: 2,
    });

    // Correction changes the app link only and keeps the owner record once the loop has history.
    const corrected = await unlinkLeaseLoop(
      editor,
      { leaseId: "701", expectedLinkRevision: 2, reason: "Linked by mistake" },
      db,
      NOW,
    );
    expect(corrected).toMatchObject({
      state: "unlinked",
      loopId: "5001",
      linkRevision: 3,
    });
    expect(
      fake.store.has(
        `${LOOP_ASSOCIATION_COLLECTIONS.owners}/${loopOwnerDocId("profile-1", "5001")}`,
      ),
    ).toBe(true);
    await expect(
      unlinkLeaseLoop(
        editor,
        { leaseId: "701", expectedLinkRevision: 3, reason: "Again" },
        db,
        NOW,
      ),
    ).rejects.toThrow(/no current Dotloop link/);
  });

  it("frees a mistaken link that never received an upload so its right lease can link it", async () => {
    const { fake, db } = setup();
    await link(db);
    await unlinkLeaseLoop(
      editor,
      { leaseId: "701", expectedLinkRevision: 1, reason: "Wrong loop" },
      db,
      NOW,
    );
    expect(
      fake.store.has(
        `${LOOP_ASSOCIATION_COLLECTIONS.owners}/${loopOwnerDocId("profile-1", "5001")}`,
      ),
    ).toBe(false);
    await expect(
      linkExistingLoop(
        editor,
        {
          leaseId: "702",
          cycleId: "cycle-x",
          observation: observation(),
          reason: "Right lease",
          expectedLinkRevision: 0,
          reuseAcrossCycles: false,
        },
        db,
        NOW,
      ),
    ).resolves.toMatchObject({ leaseId: "702", state: "current" });
  });

  it("binds the link to what staff reviewed and refuses verification accounts", async () => {
    const reviewed = reviewedLoopHash(observation());
    expect(reviewedLoopHash({ ...observation(), name: "renamed" })).not.toBe(reviewed);
    expect(
      reviewedLoopHash({
        ...observation(),
        participants: [
          { fullName: "Other", email: "other@example.test", role: "TENANT" },
        ],
      }),
    ).not.toBe(reviewed);
    const { fake, db } = setup();
    await expect(
      linkExistingLoop(
        {
          ...editor,
          email: "canary-editor@pmikcmetro.com",
          uid: "canary",
        } as AuthenticatedUser,
        {
          leaseId: "701",
          cycleId: "cycle-2027",
          observation: observation(),
          reason: "Reviewed",
          expectedLinkRevision: 0,
          reuseAcrossCycles: false,
        },
        db,
        NOW,
      ),
    ).rejects.toThrow(/Verification accounts/);
    await expect(link(db, { reason: " " })).rejects.toThrow(/Say why/);
    expect(fake.store.size).toBe(0);
  });
});

describe("S34 claim-time reservations (AC-S34-2, AC-S34-4, AC-S34-6)", () => {
  const base = {
    leaseId: "701",
    cycleId: "cycle-2027",
    profileId: "profile-1",
    actorUid: "editor-1",
    now: NOW,
  };
  it("reserves one app creation and refuses a second loop while one exists or is unresolved", () => {
    const creating = planLoopCreationClaim(null, { ...base, executionId: "exec-1" })!;
    expect(creating).toMatchObject({
      state: "creating",
      origin: "app_created",
      createExecutionId: "exec-1",
      loopId: null,
    });
    // The same attempt's claim retry needs no new write; another attempt refuses.
    expect(
      planLoopCreationClaim(creating, { ...base, executionId: "exec-1" }),
    ).toBeNull();
    expect(() =>
      planLoopCreationClaim(creating, { ...base, executionId: "exec-2" }),
    ).toThrow(/unresolved loop creation/);
    const current = { ...creating, state: "current", loopId: "5001" } as LoopAssociation;
    expect(() =>
      planLoopCreationClaim(current, { ...base, executionId: "exec-3" }),
    ).toThrow(/already has a Dotloop loop/);
    const unlinked = { ...current, state: "unlinked" } as LoopAssociation;
    expect(
      planLoopCreationClaim(unlinked, { ...base, executionId: "exec-4" }),
    ).toMatchObject({
      state: "creating",
      createExecutionId: "exec-4",
    });
  });

  it("admits an upload only into the previewed current loop, once per version, with one folder creator", () => {
    const current = {
      ...planLoopCreationClaim(null, { ...base, executionId: "exec-1" })!,
      state: "current",
      loopId: "5001",
      linkRevision: 2,
    } as LoopAssociation;
    const upload = {
      loopId: "5001",
      linkRevision: 2,
      cycleId: "cycle-2027",
      documentRef: "doc-a",
      contentHash: hash("1"),
      actorUid: "editor-1",
      now: NOW,
      holderExecuting: false,
    };
    const reserved = planUploadClaim(current, { ...upload, executionId: "up-1" })!;
    expect(reserved.folderReservation).toEqual({ executionId: "up-1", reservedAt: NOW });
    expect(() =>
      planUploadClaim(reserved, {
        ...upload,
        executionId: "up-2",
        holderExecuting: true,
      }),
    ).toThrow(/creating this loop's packet folder/);
    // A finished or failed holder no longer blocks; the next attempt takes the reservation.
    expect(
      planUploadClaim(reserved, { ...upload, executionId: "up-2" })!.folderReservation,
    ).toMatchObject({ executionId: "up-2" });
    const withFolder = {
      ...reserved,
      folder: { dotloopFolderId: "f-1", createdByExecutionId: "up-1", recordedAt: NOW },
    } as LoopAssociation;
    expect(planUploadClaim(withFolder, { ...upload, executionId: "up-3" })).toBeNull();
    expect(() =>
      planUploadClaim(withFolder, { ...upload, executionId: "up-4", linkRevision: 1 }),
    ).toThrow(/changed after preview/);
    expect(() =>
      planUploadClaim(withFolder, {
        ...upload,
        executionId: "up-5",
        cycleId: "cycle-2028",
      }),
    ).toThrow(/changed after preview/);
    const uploaded = {
      ...withFolder,
      documents: [
        {
          artifactId: "a",
          documentRef: "doc-a",
          label: "Renewal",
          contentHash: hash("1"),
          snapshotId: "s",
          derivedArtifactId: null,
          receiptId: "up-1",
          dotloopDocumentId: "d-1",
          dotloopFolderId: "f-1",
          documentName: "renewal.pdf",
          uploadedAt: NOW,
          uploadedByUid: "editor-1",
          supersedesContentHash: null,
        },
      ],
    } as LoopAssociation;
    expect(() => planUploadClaim(uploaded, { ...upload, executionId: "up-6" })).toThrow(
      /already in the linked loop/,
    );
    expect(
      planUploadClaim(uploaded, {
        ...upload,
        executionId: "up-7",
        contentHash: hash("2"),
      }),
    ).toBeNull();
  });
});

describe("S34 receipted results (AC-S34-6, AC-S34-7)", () => {
  it("turns only its own reserved creation into the current loop and records the durable folder once", async () => {
    const { db } = setup();
    const creating = planLoopCreationClaim(null, {
      leaseId: "701",
      cycleId: "cycle-2027",
      profileId: "profile-1",
      executionId: "exec-1",
      actorUid: "editor-1",
      now: NOW,
    })!;
    const { loopAssociationRef } =
      await import("@/lib/firestore/lease-document-loop-association");
    await loopAssociationRef(db, "701").set(JSON.parse(JSON.stringify(creating)));
    const loop = {
      id: "5001",
      name: "PMI renewal packet s",
      loopUrl: null,
      status: "PRE_OFFER",
      participantCount: 2,
    };
    // Another attempt's result cannot claim the lease.
    await expect(
      completeLoopCreation(
        editor,
        {
          leaseId: "701",
          cycleId: "cycle-2027",
          profileId: "profile-1",
          executionId: "exec-x",
          loop,
        },
        db,
        NOW,
      ),
    ).resolves.toMatchObject({ linked: false });
    const done = await completeLoopCreation(
      editor,
      {
        leaseId: "701",
        cycleId: "cycle-2027",
        profileId: "profile-1",
        executionId: "exec-1",
        loop,
      },
      db,
      NOW,
    );
    expect(done).toMatchObject({
      linked: true,
      association: { state: "current", loopId: "5001", origin: "app_created" },
    });
    // Folder: the first recorded folder wins for every later document, worker or restart.
    expect(
      await recordLoopFolder(
        { leaseId: "701", loopId: "5001", dotloopFolderId: "f-1", executionId: "up-1" },
        db,
        NOW,
      ),
    ).toBe("f-1");
    expect(
      await recordLoopFolder(
        { leaseId: "701", loopId: "5001", dotloopFolderId: "f-2", executionId: "up-2" },
        db,
        NOW,
      ),
    ).toBe("f-1");
    const document = {
      artifactId: "a",
      documentRef: "doc-a",
      label: "Renewal",
      snapshotId: "s-1",
      derivedArtifactId: null,
      dotloopFolderId: "f-1",
      documentName: "renewal.pdf",
      uploadedByUid: "editor-1",
    };
    await recordLoopUpload(
      editor,
      {
        leaseId: "701",
        loopId: "5001",
        document: {
          ...document,
          contentHash: hash("1"),
          receiptId: "up-1",
          dotloopDocumentId: "d-1",
          uploadedAt: "2026-10-06T12:00:00.000Z",
        },
      },
      db,
      NOW,
    );
    const successor = await recordLoopUpload(
      editor,
      {
        leaseId: "701",
        loopId: "5001",
        document: {
          ...document,
          snapshotId: "s-2",
          contentHash: hash("2"),
          receiptId: "up-2",
          dotloopDocumentId: "d-2",
          uploadedAt: "2026-10-07T12:00:00.000Z",
        },
      },
      db,
      NOW,
    );
    expect(
      successor.documents.map((entry) => [
        entry.contentHash,
        entry.supersedesContentHash,
      ]),
    ).toEqual([
      [hash("1"), null],
      [hash("2"), hash("1")],
    ]);
    // The same receipt never records twice.
    await recordLoopUpload(
      editor,
      {
        leaseId: "701",
        loopId: "5001",
        document: {
          ...document,
          snapshotId: "s-2",
          contentHash: hash("2"),
          receiptId: "up-2",
          dotloopDocumentId: "d-2",
          uploadedAt: "2026-10-07T12:00:00.000Z",
        },
      },
      db,
      NOW,
    );
    expect((await readLoopAssociation("701", db))!.documents).toHaveLength(2);
  });
});
