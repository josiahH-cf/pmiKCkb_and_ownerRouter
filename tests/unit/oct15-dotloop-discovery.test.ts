import { describe, expect, it, vi } from "vitest";
import { observeDotloopResources } from "@/lib/connections/dotloop-runtime";
import {
  observationIsFresh,
  checkDotloopSelection,
  projectDotloopPicker,
} from "@/lib/connections/dotloop-resource-selection";
import {
  projectDotloopReadiness,
  type DotloopReadinessInput,
} from "@/lib/connections/dotloop-readiness";
import type { DotloopClient } from "@/lib/integrations/dotloop/client";

const now = "2026-10-16T12:00:00.000Z";
function client() {
  return {
    getAccount: vi.fn(async () => ({
      id: "account",
      name: null,
      email: null,
      defaultProfileId: "individual",
    })),
    listProfiles: vi.fn(async () =>
      ["INDIVIDUAL", "COMPANY", "OFFICE"].map((type, i) => ({
        id: ["individual", "company", "office"][i],
        name: type,
        type,
        isDefault: i === 0,
        requiresTemplate: false,
      })),
    ),
    listLoopTemplates: vi.fn(async (id: string) =>
      id === "company"
        ? [
            {
              id: "renewal-template",
              name: "Lease Renewal",
              transactionType: "LISTING_FOR_LEASE",
              shared: true,
              global: false,
            },
          ]
        : [],
    ),
    readSubscriptionsAvailable: vi.fn(async () => false),
  };
}
async function observation(c = client()) {
  return observeDotloopResources({
    client: c as unknown as DotloopClient,
    generationId: "generation",
    actorUid: "admin",
    nowIso: now,
  });
}
describe("October 15 Dotloop visibility and readiness", () => {
  it("observes company and office template visibility without treating them as supported loop targets", async () => {
    const c = client();
    const read = await observation(c);
    expect(c.listLoopTemplates.mock.calls.map(([id]) => id)).toEqual([
      "individual",
      "company",
      "office",
    ]);
    expect(read.templates.find((t) => t.profileId === "company")?.templates).toHaveLength(
      1,
    );
    const picker = projectDotloopPicker(read, "generation", now);
    expect(picker.templatesByProfile.company[0].supported).toBe(false);
    expect(
      checkDotloopSelection({
        observation: read,
        generationId: "generation",
        nowIso: now,
        profileId: "company",
        templateId: "renewal-template",
        transactionType: "LISTING_FOR_LEASE",
        initialStatus: "PRE_LISTING",
      }).ok,
    ).toBe(false);
  });
  it("does not label a future-dated resource observation fresh", async () => {
    const read = { ...(await observation()), observedAt: "2026-10-17T12:00:00.000Z" };
    expect(observationIsFresh(read, "generation", now)).toBe(false);
    const input: DotloopReadinessInput = {
      config: { configured: true, missing: [] },
      vaultCapability: "configured",
      connection: {
        status: "connected",
        generationId: "generation",
        grantedScopes: ["loop:write"],
      },
      probe: null,
      selection: { profileId: null, templateId: null },
      nowIso: now,
      observation: {
        generationId: "generation",
        observedAt: read.observedAt,
        accountOk: true,
        accountEmail: null,
        profiles: [],
        profilesOk: true,
        templates: [],
        subscriptionsReadable: false,
      },
    };
    expect(projectDotloopReadiness(input).freshness?.stale).toBe(true);
  });
  it("refuses selection after an account or profile observation failed", async () => {
    const read = await observation();
    const template = {
      id: "renewal-template",
      name: "Lease Renewal",
      transactionType: "LISTING_FOR_LEASE",
      shared: true,
      global: false,
    };
    const failed = {
      ...read,
      accountError: "unavailable" as const,
      templates: [{ profileId: "individual", templates: [template], error: null }],
    };
    expect(
      checkDotloopSelection({
        observation: failed,
        generationId: "generation",
        nowIso: now,
        profileId: "individual",
        templateId: template.id,
        transactionType: template.transactionType!,
        initialStatus: "PRE_LISTING",
      }).ok,
    ).toBe(false);
  });
});
