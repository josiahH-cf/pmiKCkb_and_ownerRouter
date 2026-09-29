import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { reserveRenewalNoticeLease } from "@/lib/firestore/renewal-notice-safety";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import {
  NoticeSafetyMarkerSchema,
  noticeScopeHash,
  pendingNoticeHash,
} from "@/lib/lease-renewal/notice-safety";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";

const actor = {
  uid: "reservation-reader",
  email: "reservation-reader@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as AuthenticatedUser;
const leaseId = "9001";
const path = `lease_renewal_workspaces/${renewalWorkspaceDocId(leaseId)}/approval_safety/notice`;
function marker(version = 1) {
  const scopeHash = noticeScopeHash(leaseId, null, null);
  const sourceReadAt = {
    lease: version === 1 ? 0 : 500,
    status: version === 1 ? 0 : 600,
  };
  return {
    scopeHash,
    sourceReadAt,
    semanticHash: pendingNoticeHash(scopeHash, sourceReadAt),
    version,
    observedAt: "2026-09-29T00:00:00.000Z",
  };
}
function setup() {
  const fake = new FakeTransactionalFirestore();
  const ref = fake.collection(path.slice(0, path.lastIndexOf("/"))).doc("notice");
  const get = vi.spyOn(ref, "get"),
    create = vi.spyOn(ref, "create");
  const runTransaction = vi.fn(() => {
    throw new Error("Reservation must not open a transaction");
  });
  const db = {
    collection: vi.fn(() => ({ doc: () => ref })),
    runTransaction,
  } as unknown as Firestore;
  return { fake, ref, get, create, db, runTransaction };
}

describe("exact atomic notice reservation", () => {
  it("creates only the unchanged five-field pending marker without a transaction", async () => {
    const { fake, get, create, db, runTransaction } = setup();
    await expect(reserveRenewalNoticeLease(actor, leaseId, db)).resolves.toBe(true);
    const saved = NoticeSafetyMarkerSchema.parse(fake.read(path));
    expect(saved).toMatchObject({ ...marker(), observedAt: expect.any(String) });
    expect(Object.keys(saved).sort()).toEqual([
      "observedAt",
      "scopeHash",
      "semanticHash",
      "sourceReadAt",
      "version",
    ]);
    expect(fake.store.size).toBe(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it("serves many warm reservations by exact reads and preserves an advanced marker", async () => {
    const { fake, get, create, db, runTransaction } = setup();
    const advanced = {
      ...marker(42),
      scopeHash: "a".repeat(64),
      semanticHash: "b".repeat(64),
    };
    fake.seed(path, advanced);
    expect(
      await Promise.all(
        Array.from({ length: 54 }, () => reserveRenewalNoticeLease(actor, leaseId, db)),
      ),
    ).toEqual(Array(54).fill(false));
    expect(get).toHaveBeenCalledTimes(54);
    expect(create).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
    expect(fake.read(path)).toEqual(advanced);
  });

  it("checks managed read authority before any store access", async () => {
    const { get, create, db } = setup();
    await expect(
      reserveRenewalNoticeLease(
        { ...actor, email: "reader@example.invalid" },
        leaseId,
        db,
      ),
    ).rejects.toThrow("Managed renewals read authority");
    expect(get).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("propagates an initial read failure without dispatching a create", async () => {
    const { get, create, db } = setup();
    const failure = Object.assign(new Error("Synthetic read failure"), { code: 14 });
    get.mockRejectedValueOnce(failure);
    await expect(reserveRenewalNoticeLease(actor, leaseId, db)).rejects.toBe(failure);
    expect(create).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each([14, 10, 7, "6", "ALREADY_EXISTS", undefined])(
    "propagates non-numeric-6 create failure %s without retry or readback",
    async (code) => {
      const { get, create, db, fake } = setup();
      const failure = Object.assign(new Error("already-exists"), { code });
      create.mockRejectedValueOnce(failure);
      await expect(reserveRenewalNoticeLease(actor, leaseId, db)).rejects.toBe(failure);
      expect(get).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledTimes(1);
      expect(fake.store.size).toBe(0);
    },
  );

  it("keeps a lost create reply failed and permits only a later independent exact read", async () => {
    const { fake, get, create, db } = setup();
    const failure = Object.assign(new Error("Synthetic lost reply"), { code: 14 });
    create.mockImplementationOnce(async (data) => {
      await fake.createDocument(path, data);
      throw failure;
    });
    await expect(reserveRenewalNoticeLease(actor, leaseId, db)).rejects.toBe(failure);
    const persisted = fake.read(path);
    expect(persisted).toBeDefined();
    expect(get).toHaveBeenCalledTimes(1);
    await expect(reserveRenewalNoticeLease(actor, leaseId, db)).resolves.toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    expect(fake.read(path)).toEqual(persisted);
  });

  it("accepts only a fresh exact valid winner after numeric ALREADY_EXISTS without overwriting advancement", async () => {
    const { fake, get, create, db } = setup();
    const advanced = marker(8);
    create.mockImplementationOnce(async () => {
      await fake.createDocument(path, advanced);
      throw Object.assign(new Error("Synthetic peer won"), { code: 6 });
    });
    await expect(reserveRenewalNoticeLease(actor, leaseId, db)).resolves.toBe(false);
    expect(get).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(fake.read(path)).toEqual(advanced);
  });

  it.each(["missing", "malformed", "foreign_path", "read_failure"])(
    "refuses %s ALREADY_EXISTS readback without retrying",
    async (kind) => {
      const { fake, get, create, db } = setup();
      get.mockImplementationOnce(() =>
        fake
          .collection(path.slice(0, path.lastIndexOf("/")))
          .doc("notice")
          .get(),
      );
      create.mockImplementationOnce(async () => {
        if (kind !== "missing")
          fake.seed(path, kind === "malformed" ? { version: 1 } : marker());
        throw Object.assign(new Error("Synthetic peer won"), { code: 6 });
      });
      get.mockImplementationOnce(async () => {
        if (kind === "read_failure") throw new Error("Synthetic readback failure");
        const existing = await fake
          .collection(path.slice(0, path.lastIndexOf("/")))
          .doc("notice")
          .get();
        return kind === "foreign_path"
          ? {
              ...existing,
              ref: {
                ...existing.ref,
                path: `lease_renewal_workspaces/${"e".repeat(64)}/approval_safety/notice`,
              } as ReturnType<typeof setup>["ref"],
            }
          : existing;
      });
      await expect(reserveRenewalNoticeLease(actor, leaseId, db)).rejects.toThrow();
      expect(get).toHaveBeenCalledTimes(2);
      expect(create).toHaveBeenCalledTimes(1);
      expect(fake.read(path)).toEqual(
        kind === "missing" ? undefined : kind === "malformed" ? { version: 1 } : marker(),
      );
    },
  );

  it("refuses malformed existing metadata without replacing it", async () => {
    const { fake, create, db } = setup();
    fake.seed(path, { version: 1 });
    await expect(reserveRenewalNoticeLease(actor, leaseId, db)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(fake.read(path)).toEqual({ version: 1 });
  });

  it("refuses a reference outside the exact requested marker before any read or create", async () => {
    const { ref, get, create, db } = setup();
    Object.defineProperty(ref, "path", {
      value: `lease_renewal_workspaces/${"e".repeat(64)}/approval_safety/notice`,
    });
    await expect(reserveRenewalNoticeLease(actor, leaseId, db)).rejects.toThrow(
      "metadata is invalid",
    );
    expect(get).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("models the SDK create collision as numeric6 without overwriting the original fake document", async () => {
    const { ref, fake } = setup();
    await ref.create(marker());
    await expect(ref.create(marker(2))).rejects.toMatchObject({ code: 6 });
    expect(fake.read(path)).toEqual(marker());
  });
});
