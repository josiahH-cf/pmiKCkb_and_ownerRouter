import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  buildSpaceProvisioningPlan,
  type SpaceProvisioningPlan,
} from "@/lib/admin/space-request-commands";
import {
  MemorySpaceProvisioningLedger,
  SPACE_PROVISION_CONFIRMATION,
  SPACE_RETIRE_CONFIRMATION,
  buildAuthorizedSpaceProvisioningPreview,
  provisionFixedSpacePilot,
  retireFixedSpacePilot,
  type AuthorizedSpaceProvisioningPreview,
  type FixedSpaceProvisioningProvider,
} from "@/lib/admin/space-provisioning-pilot";

const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const existing = Array.from({ length: 11 }, (_, index) => `space-${index + 1}`);

function plan(): SpaceProvisioningPlan {
  return buildSpaceProvisioningPlan({
    name: "Owner Statements",
    scope: "Read-only owner statement process",
    intendedSources: [],
    gcpProjectId: "pmi-kc-kb-prod",
    vertexSearchLocation: "us",
    existingVertexDataStoreIds: Object.fromEntries(
      existing.map((id) => [id, `kb-${id}-txt`]),
    ),
    existingDriveFolderIds: Object.fromEntries(
      existing.map((id) => [id, `gs://pmi-kc-kb-prod-sources-558870356522/${id}/`]),
    ),
  });
}

class FakeProvider implements FixedSpaceProvisioningProvider {
  readonly dataStores = new Set(existing.map((id) => `kb-${id}-txt`));
  provisionCalls = 0;
  retireCalls = 0;

  async listDataStoreIds() {
    return [...this.dataStores];
  }
  async readDataStore(preview: AuthorizedSpaceProvisioningPreview) {
    return this.dataStores.has(preview.plan.dataStoreId)
      ? { id: preview.plan.dataStoreId, displayName: preview.plan.displayName }
      : null;
  }
  async provisionDataStoreAndImportSource(preview: AuthorizedSpaceProvisioningPreview) {
    this.provisionCalls += 1;
    this.dataStores.add(preview.plan.dataStoreId);
    return { providerOperationRef: "operations/create-and-import-1" };
  }
  async retireDataStore(preview: AuthorizedSpaceProvisioningPreview) {
    this.retireCalls += 1;
    this.dataStores.delete(preview.plan.dataStoreId);
    return { providerOperationRef: "operations/delete-1" };
  }
}

function preview() {
  return buildAuthorizedSpaceProvisioningPreview(plan(), {
    requestId: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51",
    confirmedSpaceId: "owner-statements",
    sourceObjectUri:
      "gs://pmi-kc-kb-prod-sources-558870356522/owner-statements/approved.jsonl",
    approvalEvidenceRef: "owner-approval:2026-08-27",
  });
}

describe("S36 fixed pilot provider lifecycle", () => {
  it("keeps the client review surface on the browser-safe value contract", () => {
    const component = readFileSync(
      resolve(process.cwd(), "components/admin/SpaceRequestPanel.tsx"),
      "utf8",
    );
    const contract = readFileSync(
      resolve(process.cwd(), "lib/admin/space-provisioning-contract.ts"),
      "utf8",
    );
    expect(component).toContain("@/lib/admin/space-provisioning-contract");
    expect(component).not.toContain("@/lib/admin/space-provisioning-pilot");
    expect(contract).not.toMatch(/@\/lib\/(?:auth|firestore|firebase)|node:/);
  });

  it("refuses packet path drift and caller-supplied resource fields", () => {
    expect(() =>
      buildAuthorizedSpaceProvisioningPreview(plan(), {
        requestId: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51",
        confirmedSpaceId: "owner-statements",
        sourceObjectUri: "gs://another-bucket/approved.jsonl",
        approvalEvidenceRef: "owner-approval:2026-08-27",
      }),
    ).toThrow(/isolated Space prefix/i);
    expect(() =>
      buildAuthorizedSpaceProvisioningPreview(plan(), {
        requestId: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51",
        confirmedSpaceId: "owner-statements",
        sourceObjectUri:
          "gs://pmi-kc-kb-prod-sources-558870356522/owner-statements/approved.jsonl",
        approvalEvidenceRef: "owner-approval:2026-08-27",
        projectId: "attacker-project",
      } as never),
    ).toThrow(/unrecognized/i);
  });

  it("provisions once, reads back, preserves eleven, and retires only the pilot", async () => {
    const provider = new FakeProvider();
    const ledger = new MemorySpaceProvisioningLedger();
    const exact = preview();
    const provisionAttempt = "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f52";
    const receipt = await provisionFixedSpacePilot({
      actor: admin,
      preview: exact,
      confirmation: SPACE_PROVISION_CONFIRMATION,
      attemptKey: provisionAttempt,
      provisioningEnabled: true,
      provider,
      ledger,
      now: "2026-08-27T12:00:00.000Z",
    });
    expect(receipt).toMatchObject({ operation: "provision", duplicate: false });
    expect(provider.dataStores.has(exact.plan.dataStoreId)).toBe(true);
    expect(existing.every((id) => provider.dataStores.has(`kb-${id}-txt`))).toBe(true);
    await expect(
      provisionFixedSpacePilot({
        actor: admin,
        preview: exact,
        confirmation: SPACE_PROVISION_CONFIRMATION,
        attemptKey: provisionAttempt,
        provisioningEnabled: true,
        provider,
        ledger,
      }),
    ).resolves.toMatchObject({ id: receipt.id, duplicate: true });
    expect(provider.provisionCalls).toBe(1);

    await retireFixedSpacePilot({
      actor: admin,
      preview: exact,
      confirmation: SPACE_RETIRE_CONFIRMATION,
      attemptKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f53",
      provisioningEnabled: true,
      provider,
      ledger,
    });
    expect(provider.dataStores.has(exact.plan.dataStoreId)).toBe(false);
    expect(existing.every((id) => provider.dataStores.has(`kb-${id}-txt`))).toBe(true);
    expect(provider.retireCalls).toBe(1);
  });

  it("refuses before provider work while the production flag is closed", async () => {
    const provider = new FakeProvider();
    await expect(
      provisionFixedSpacePilot({
        actor: admin,
        preview: preview(),
        confirmation: SPACE_PROVISION_CONFIRMATION,
        attemptKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f54",
        provisioningEnabled: false,
        provider,
        ledger: new MemorySpaceProvisioningLedger(),
      }),
    ).rejects.toThrow(/closed/i);
    expect(provider.provisionCalls).toBe(0);
  });
});
