// S106 AC-S106-3/6/9 (fail-first): readiness is computed from the labeled cached observation of the
// current connection generation, with no provider request on render; a stale, other-generation,
// renamed, missing or unsupported selection is named exactly; provider-reported scopes decide loop
// write readiness; and the resource picker accepts only stable ids from a fresh observation.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dotloopScopeCoverage,
  projectDotloopReadiness,
  type DotloopObservedResources,
  type DotloopReadinessInput,
} from "@/lib/connections/dotloop-readiness";
import {
  checkDotloopSelection,
  projectDotloopPicker,
} from "@/lib/connections/dotloop-resource-selection";
import { readDotloopRuntimeReadiness } from "@/lib/connections/dotloop-runtime";
import type { DotloopResourceObservation } from "@/lib/firestore/dotloop-connection-observations";

const generationId = "11111111-1111-4111-8111-111111111111";
const now = "2026-10-07T12:00:00.000Z";
const SCOPES = [
  "account:read",
  "profile:read",
  "loop:read",
  "loop:write",
  "template:read",
];

function observed(
  overrides: Partial<DotloopObservedResources> = {},
): DotloopObservedResources {
  return {
    generationId,
    observedAt: "2026-10-07T11:00:00.000Z",
    accountOk: true,
    accountEmail: "integrations@pmikcmetro.com",
    profiles: [
      { id: "10", name: "PMI Leasing", type: "INDIVIDUAL" },
      { id: "20", name: "PMI Office", type: "OFFICE" },
    ],
    profilesOk: true,
    templates: [
      {
        profileId: "10",
        ok: true,
        templates: [
          { id: "100", name: "Renewal", transactionType: "LEASE_OFFER" },
          { id: "101", name: "Purchase", transactionType: "PURCHASE_OFFER" },
        ],
      },
    ],
    subscriptionsReadable: null,
    ...overrides,
  };
}

function input(overrides: Partial<DotloopReadinessInput> = {}): DotloopReadinessInput {
  return {
    config: { configured: true, missing: [] },
    vaultCapability: "configured",
    connection: { status: "connected", generationId, grantedScopes: SCOPES },
    probe: null,
    selection: {
      profileId: "10",
      templateId: "100",
      profileLabel: "PMI Leasing",
      templateLabel: "Renewal",
      transactionType: "LEASE_OFFER",
      initialStatus: "PRE_OFFER",
    },
    observation: observed(),
    nowIso: now,
    ...overrides,
  };
}

describe("S106 readiness from the labeled observation (AC-S106-3, AC-S106-9)", () => {
  it("reports connected only with a fresh observation, a valid selection and reported loop write", () => {
    const readiness = projectDotloopReadiness(input());
    expect(readiness).toMatchObject({
      state: "connected",
      reasons: [],
      accountEmail: "integrations@pmikcmetro.com",
      freshness: { observedAt: "2026-10-07T11:00:00.000Z", stale: false },
      selectionDetail: { profile: "ok", template: "ok" },
    });
    expect(readiness.signatureApiAvailable).toBe(false);
  });

  it("treats another generation's or a day-old observation as stale, never as connected", () => {
    expect(
      projectDotloopReadiness(
        input({ observation: observed({ generationId: "other" }) }),
      ),
    ).toMatchObject({ state: "unavailable", reasons: ["observation_stale"] });
    expect(
      projectDotloopReadiness(
        input({ observation: observed({ observedAt: "2026-10-06T11:00:00.000Z" }) }),
      ),
    ).toMatchObject({ state: "unavailable", reasons: ["observation_stale"] });
  });

  it("does not report connected when Dotloop reported no scopes", () => {
    const readiness = projectDotloopReadiness(
      input({ connection: { status: "connected", generationId, grantedScopes: null } }),
    );
    expect(readiness.state).toBe("missing_resources");
    expect(readiness.reasons).toEqual(["provider_scope_unreported"]);
    expect(readiness.scopes?.reported).toBe(false);
  });

  it("names a missing loop write grant and accepts loop:write for template reads", () => {
    expect(
      projectDotloopReadiness(
        input({
          connection: {
            status: "connected",
            generationId,
            grantedScopes: ["account:read", "profile:read", "loop:read", "template:read"],
          },
        }),
      ).reasons,
    ).toEqual(["loop_write_scope"]);
    expect(dotloopScopeCoverage(["loop:write"])).toMatchObject({
      reported: true,
      loopWrite: true,
      templateRead: true,
      accountRead: false,
    });
  });

  it("keeps a renamed resource selected by id and shows its current name", () => {
    const readiness = projectDotloopReadiness(
      input({
        observation: observed({
          profiles: [{ id: "10", name: "PMI Leasing Team", type: "INDIVIDUAL" }],
        }),
      }),
    );
    expect(readiness.state).toBe("connected");
    expect(readiness.selectionDetail).toMatchObject({
      profile: "renamed",
      profileName: "PMI Leasing Team",
    });
  });

  it("names a vanished or unsupported selected resource exactly", () => {
    expect(
      projectDotloopReadiness(
        input({
          observation: observed({
            templates: [{ profileId: "10", ok: true, templates: [] }],
          }),
        }),
      ).reasons,
    ).toContain("selected_resource_unavailable");
    expect(
      projectDotloopReadiness(
        input({
          selection: {
            ...input().selection,
            profileId: "20",
            profileLabel: "PMI Office",
          },
        }),
      ).reasons,
    ).toContain("selected_resource_unsupported");
    expect(
      projectDotloopReadiness(
        input({
          selection: {
            ...input().selection,
            templateId: "101",
            templateLabel: "Purchase",
          },
        }),
      ).reasons,
    ).toContain("selected_resource_unsupported");
  });

  it("requires the transaction settings for a selected profile and template", () => {
    expect(
      projectDotloopReadiness(
        input({
          selection: { ...input().selection, transactionType: null, initialStatus: null },
        }),
      ).reasons,
    ).toEqual(["transaction_settings"]);
  });
});

describe("S106 ordinary readiness makes no provider request (AC-S106-9)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads only the connection, selection and cached observation", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const observation: DotloopResourceObservation = {
      generationId,
      observedAt: "2026-10-07T11:00:00.000Z",
      observedByUid: "admin-1",
      account: {
        id: "55",
        name: "Integrations",
        email: "integrations@pmikcmetro.com",
        defaultProfileId: "10",
      },
      accountError: null,
      profiles: [
        {
          id: "10",
          name: "PMI Leasing",
          type: "INDIVIDUAL",
          isDefault: true,
          requiresTemplate: false,
        },
      ],
      profilesError: null,
      profilesTruncated: false,
      templates: [
        {
          profileId: "10",
          error: null,
          templates: [
            {
              id: "100",
              name: "Renewal",
              transactionType: "LEASE_OFFER",
              shared: false,
              global: false,
            },
          ],
        },
      ],
      subscriptionsReadable: null,
    };
    const readiness = await readDotloopRuntimeReadiness(
      {
        DOTLOOP_OAUTH_CLIENT_ID: "client",
        DOTLOOP_OAUTH_CLIENT_SECRET: "secret",
        DOTLOOP_OAUTH_REDIRECT_URI: "https://a.example/api/connections/dotloop/callback",
        CONNECTOR_SECRET_VAULT_PROJECT_ID: "pmi-kc-kb-prod",
      },
      {
        nowIso: now,
        connections: {
          getConnection: async () =>
            ({
              connectorId: "dotloop",
              method: "oauth",
              status: "connected",
              generationId,
              revision: 2,
              secretRef: "ref",
              grantedScopes: SCOPES,
              oauthState: "ready",
              connectedByUid: "admin-1",
              connectedAt: now,
              updatedAt: now,
            }) as never,
        },
        observations: { read: async () => observation },
        readSelection: async () => ({
          profile_id: "10",
          profile_label: "PMI Leasing",
          template_id: "100",
          template_label: "Renewal",
          transaction_type: "LEASE_OFFER",
          initial_status: "PRE_OFFER",
        }),
      },
    );
    expect(readiness.state).toBe("connected");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("S106 resource picker contract (AC-S106-6)", () => {
  const observation: DotloopResourceObservation = {
    generationId,
    observedAt: "2026-10-07T11:00:00.000Z",
    observedByUid: "admin-1",
    account: {
      id: "55",
      name: "I",
      email: "integrations@pmikcmetro.com",
      defaultProfileId: "10",
    },
    accountError: null,
    profiles: [
      {
        id: "10",
        name: "PMI Leasing",
        type: "INDIVIDUAL",
        isDefault: true,
        requiresTemplate: false,
      },
      {
        id: "20",
        name: "PMI Office",
        type: "OFFICE",
        isDefault: false,
        requiresTemplate: false,
      },
    ],
    profilesError: null,
    profilesTruncated: false,
    templates: [
      {
        profileId: "10",
        error: null,
        templates: [
          {
            id: "100",
            name: "Renewal",
            transactionType: "LEASE_OFFER",
            shared: true,
            global: false,
          },
          {
            id: "101",
            name: "Purchase",
            transactionType: "PURCHASE_OFFER",
            shared: false,
            global: false,
          },
        ],
      },
    ],
    subscriptionsReadable: null,
  };
  const request = {
    observation,
    generationId,
    nowIso: now,
    profileId: "10",
    templateId: "100",
    transactionType: "LEASE_OFFER",
    initialStatus: "PRE_OFFER",
  };

  it("projects stable ids, supportability and documented statuses only", () => {
    const picker = projectDotloopPicker(observation, generationId, now);
    expect(picker.stale).toBe(false);
    expect(picker.profiles.map((profile) => [profile.id, profile.supported])).toEqual([
      ["10", true],
      ["20", false],
    ]);
    expect(picker.templatesByProfile["10"]).toEqual([
      expect.objectContaining({
        id: "100",
        supported: true,
        statuses: ["PRE_OFFER", "UNDER_CONTRACT", "LEASED", "ARCHIVED"],
      }),
      expect.objectContaining({ id: "101", supported: false, statuses: [] }),
    ]);
    expect(JSON.stringify(picker)).not.toMatch(/token|secret/i);
  });

  it("accepts a selection only from the current generation's fresh observation", () => {
    expect(checkDotloopSelection(request)).toEqual({
      ok: true,
      profileLabel: "PMI Leasing",
      templateLabel: "Renewal",
      transactionType: "LEASE_OFFER",
      initialStatus: "PRE_OFFER",
    });
    for (const refused of [
      { ...request, generationId: "other-generation" },
      { ...request, nowIso: "2026-10-09T12:00:00.000Z" },
      { ...request, profileId: "99" },
      { ...request, profileId: "20" },
      { ...request, templateId: "999" },
      { ...request, templateId: "101" },
      { ...request, transactionType: "LISTING_FOR_LEASE" },
      { ...request, initialStatus: "ACTIVE_LISTING" },
    ]) {
      expect(checkDotloopSelection(refused).ok).toBe(false);
    }
  });
});
