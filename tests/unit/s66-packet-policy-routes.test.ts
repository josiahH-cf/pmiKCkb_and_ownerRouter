import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET as getChargePolicy,
  POST as postChargePolicy,
} from "@/app/api/admin/lease-charge-policy/route";
import {
  GET as getFamilyUse,
  POST as postFamilyUse,
} from "@/app/api/admin/lease-artifact-family-use/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  readFamilyUseRecord,
  setFamilyUse,
} from "@/lib/firestore/lease-artifact-family-use";
import {
  publishChargePolicy,
  readChargePolicy,
} from "@/lib/firestore/lease-charge-policy";

// S66 (AC-S66-6, AC-S66-7): route authorization and dispatch; schemas stay real and the stores are
// mocked (their persistence, version and idempotency rules are covered by the emulator tests).
vi.mock("@/lib/firestore/lease-artifact-family-use", () => ({
  readFamilyUseRecord: vi.fn(),
  setFamilyUse: vi.fn(),
}));
vi.mock("@/lib/firestore/lease-charge-policy", () => ({
  readChargePolicy: vi.fn(),
  publishChargePolicy: vi.fn(),
}));

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
const editor = { ...admin, uid: "editor-1", role: "Editor" as const };
const operationId = "00000000-0000-4000-8000-000000000001";

function req(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const policyBody = {
  content: {
    residentBenefitPackage: { monthlyCents: 4_500 },
    insuranceProgram: null,
    animals: null,
  },
  effectiveFrom: "2026-10-01",
  expectedVersion: 0,
  operationId,
};

beforeEach(() => {
  vi.mocked(readFamilyUseRecord).mockReset();
  vi.mocked(setFamilyUse).mockReset();
  vi.mocked(readChargePolicy).mockReset();
  vi.mocked(publishChargePolicy).mockReset();
});

afterEach(() => setAuthResolverForTest(() => null));

describe("S66 Admin renewal packet configuration routes", () => {
  it("lets an Admin read every family's resolved use and record one", async () => {
    setAuthResolverForTest(() => admin);
    vi.mocked(readFamilyUseRecord).mockResolvedValue({ readable: true, record: null });
    const read = await getFamilyUse();
    expect(read.status).toBe(200);
    const payload = (await read.json()) as {
      familyUse: { version: number; families: Array<{ kind: string; use: string }> };
    };
    expect(payload.familyUse.version).toBe(0);
    expect(payload.familyUse.families).toHaveLength(10);
    vi.mocked(setFamilyUse).mockResolvedValue({
      record: {
        schemaVersion: "lease-artifact-family-use/v1",
        version: 1,
        families: {
          brokerage_disclosure: {
            use: "conditional",
            recordedAt: "2026-10-07T00:00:00.000Z",
            recordedByUid: "admin-1",
          },
        },
        updatedAt: "2026-10-07T00:00:00.000Z",
        updatedByUid: "admin-1",
      },
      duplicate: false,
    });
    const body = {
      kind: "brokerage_disclosure",
      use: "conditional",
      expectedVersion: 0,
      operationId,
    };
    const saved = await postFamilyUse(req("/api/admin/lease-artifact-family-use", body));
    expect(saved.status).toBe(200);
    expect(vi.mocked(setFamilyUse).mock.calls[0][1]).toEqual(body);
    expect(
      (
        (await saved.json()) as {
          familyUse: { families: Array<{ kind: string; use: string }> };
        }
      ).familyUse.families.find((family) => family.kind === "brokerage_disclosure")?.use,
    ).toBe("conditional");
  });

  it("refuses an Editor and a malformed body before any store call", async () => {
    setAuthResolverForTest(() => editor);
    expect((await getFamilyUse()).status).toBe(403);
    expect((await getChargePolicy()).status).toBe(403);
    expect(
      (await postChargePolicy(req("/api/admin/lease-charge-policy", policyBody))).status,
    ).toBe(403);
    setAuthResolverForTest(() => admin);
    const malformed = await postFamilyUse(
      req("/api/admin/lease-artifact-family-use", {
        kind: "boom",
        use: "always",
        expectedVersion: 0,
        operationId,
      }),
    );
    expect(malformed.status).toBe(400);
    const gapped = await postChargePolicy(
      req("/api/admin/lease-charge-policy", {
        ...policyBody,
        content: {
          ...policyBody.content,
          animals: {
            basis: "weight_lb",
            tiers: [
              {
                tierId: "small",
                label: "Small",
                min: 0,
                maxExclusive: 20,
                monthlyCents: 1,
                oneTimeCents: 1,
                refundableDepositCents: 1,
              },
              {
                tierId: "large",
                label: "Large",
                min: 30,
                maxExclusive: null,
                monthlyCents: 1,
                oneTimeCents: 1,
                refundableDepositCents: 1,
              },
            ],
            treatments: { pet: "tiered", assistance_animal: "no_charge" },
            agreementFor: { pet: true, assistance_animal: false },
            juvenileWeightBasis: null,
          },
        },
      }),
    );
    expect(gapped.status).toBe(400);
    expect(setFamilyUse).not.toHaveBeenCalled();
    expect(publishChargePolicy).not.toHaveBeenCalled();
  });

  it("publishes a charge policy version as an Admin", async () => {
    setAuthResolverForTest(() => admin);
    vi.mocked(publishChargePolicy).mockResolvedValue({
      record: {
        schemaVersion: "renewal-charge-policy/v1",
        version: 1,
        effectiveFrom: "2026-10-01",
        content: policyBody.content,
        publishedAt: "2026-10-07T00:00:00.000Z",
        publishedByUid: "admin-1",
      },
      duplicate: false,
    });
    const published = await postChargePolicy(
      req("/api/admin/lease-charge-policy", policyBody),
    );
    expect(published.status).toBe(200);
    expect(
      ((await published.json()) as { chargePolicy: { record: { version: number } } })
        .chargePolicy.record.version,
    ).toBe(1);
  });
});
