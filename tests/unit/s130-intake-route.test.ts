import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH, POST, PUT } from "@/app/api/admin/lease-artifact-intake/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  decideArtifactFamily,
  readArtifactIntakeManifest,
  receiveArtifactFamily,
  recordArtifactFieldMap,
} from "@/lib/firestore/lease-artifact-intake";
import { emptyArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";

// S130 (F10): the route's auth and dispatch are the unit under test; the schemas stay real and the
// repository is mocked (its persistence, binding, classification and catalog rules are covered by
// the store test).
vi.mock("@/lib/firestore/lease-artifact-intake", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/firestore/lease-artifact-intake")>();
  return {
    ...actual,
    readArtifactIntakeManifest: vi.fn(),
    receiveArtifactFamily: vi.fn(),
    recordArtifactFieldMap: vi.fn(),
    decideArtifactFamily: vi.fn(),
  };
});

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
const approver = { ...admin, uid: "approver-1", role: "Approver" as const };
const operationId = "00000000-0000-4000-8000-000000000001";
const receiveBody = {
  kind: "renewal_extension",
  publicationSource: {
    system: "s21_publication",
    reference: "publication:synthetic-ext-0001",
    contentHash: "a".repeat(64),
  },
  operationId,
};
const fieldMap = {
  schemaVersion: "artifact-field-map/v1",
  artifactKind: "renewal_extension",
  mapVersion: "v1",
  templateVersion: "publication:synthetic-ext-0001",
  formFamily: "synthetic-family",
  formFamilyExtensionCompatible: true,
  audience: "tenant",
  allowedPacketContexts: ["renewal_extension"],
  fields: [
    {
      fieldId: "Rent",
      factKey: "renewal.approved_rent",
      meaning: "Rent",
      required: true,
      multiplicity: "single",
      allowedSourceSystems: ["staff_recorded_owner_approval"],
    },
  ],
  signers: [
    {
      signerRole: "tenant",
      participantKind: "tenant",
      required: true,
      location: "Signature",
    },
  ],
  reviewNote: "SYNTHETIC",
};
const entry = {
  id: "renewal_extension",
  kind: "renewal_extension",
  state: "received",
  revision: 1,
  updated_at: "2026-09-20T12:00:00Z",
};

function req(method: "POST" | "PUT" | "PATCH", body: unknown) {
  return new Request("http://localhost/api/admin/lease-artifact-intake", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(readArtifactIntakeManifest).mockReset();
  vi.mocked(receiveArtifactFamily).mockReset();
  vi.mocked(recordArtifactFieldMap).mockReset();
  vi.mocked(decideArtifactFamily).mockReset();
});

afterEach(() => {
  setAuthResolverForTest(() => null);
});

describe("admin lease-artifact-intake route (S130)", () => {
  it("lets an Admin read the manifest with checkpoints, receive, record a mapping and decide", async () => {
    setAuthResolverForTest(() => admin);
    vi.mocked(readArtifactIntakeManifest).mockResolvedValue(
      emptyArtifactIntakeManifest(),
    );
    vi.mocked(receiveArtifactFamily).mockResolvedValue({
      entry: entry as never,
      duplicate: false,
    });
    vi.mocked(recordArtifactFieldMap).mockResolvedValue({
      ...entry,
      state: "reviewed",
      revision: 2,
    } as never);
    vi.mocked(decideArtifactFamily).mockResolvedValue({
      entry: { ...entry, state: "approved", revision: 3 } as never,
      duplicate: false,
    });

    const read = await GET();
    expect(read.status).toBe(200);
    const payload = (await read.json()) as {
      artifactIntake: {
        manifest: unknown;
        checkpoints: Array<{ id: string; state: string }>;
      };
    };
    expect(payload.artifactIntake.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(
      [
        "intake",
        "review_coverage",
        "approve_mappings",
        "verify_filled_values",
        "approve_packet",
        "confirm_provider_effect",
        "inspect_returned_state",
      ],
    );
    expect((await POST(req("POST", receiveBody))).status).toBe(200);
    expect(receiveArtifactFamily).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      expect.objectContaining({ kind: "renewal_extension", operationId }),
    );
    expect(
      (
        await PUT(
          req("PUT", { kind: "renewal_extension", fieldMap, expectedRevision: 1 }),
        )
      ).status,
    ).toBe(200);
    const decided = await PATCH(
      req("PATCH", {
        kind: "renewal_extension",
        decision: "approve",
        reason: "SYNTHETIC",
        expectedRevision: 2,
        operationId,
      }),
    );
    expect(decided.status).toBe(200);
    await expect(decided.json()).resolves.toMatchObject({
      artifactIntake: { entry: { state: "approved" } },
    });
  });

  it("blocks a non-Admin from every method (403, repository never runs)", async () => {
    setAuthResolverForTest(() => approver);
    expect((await GET()).status).toBe(403);
    expect((await POST(req("POST", receiveBody))).status).toBe(403);
    expect(
      (
        await PUT(
          req("PUT", { kind: "renewal_extension", fieldMap, expectedRevision: 1 }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await PATCH(
          req("PATCH", {
            kind: "renewal_extension",
            decision: "approve",
            reason: "x",
            expectedRevision: 1,
            operationId,
          }),
        )
      ).status,
    ).toBe(403);
    expect(readArtifactIntakeManifest).not.toHaveBeenCalled();
    expect(receiveArtifactFamily).not.toHaveBeenCalled();
    expect(recordArtifactFieldMap).not.toHaveBeenCalled();
    expect(decideArtifactFamily).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with a 400 before the repository runs", async () => {
    setAuthResolverForTest(() => admin);
    expect(
      (
        await POST(
          req("POST", {
            ...receiveBody,
            publicationSource: { ...receiveBody.publicationSource, system: "drive" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(req("POST", { ...receiveBody, kind: "mystery_form" }))).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          req("PUT", {
            kind: "renewal_extension",
            fieldMap: { ...fieldMap, extra: 1 },
            expectedRevision: 1,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          req("PUT", {
            kind: "renewal_extension",
            fieldMap: {
              ...fieldMap,
              signers: [{ ...fieldMap.signers[0], signerRole: "owner" }],
            },
            expectedRevision: 1,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PATCH(
          req("PATCH", {
            kind: "renewal_extension",
            decision: "maybe",
            reason: "x",
            expectedRevision: 1,
            operationId,
          }),
        )
      ).status,
    ).toBe(400);
    expect(receiveArtifactFamily).not.toHaveBeenCalled();
    expect(recordArtifactFieldMap).not.toHaveBeenCalled();
    expect(decideArtifactFamily).not.toHaveBeenCalled();
  });
});
