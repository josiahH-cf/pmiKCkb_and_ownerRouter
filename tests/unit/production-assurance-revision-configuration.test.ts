import { describe, expect, it, vi } from "vitest";

import {
  assertRenewalSheetResponseIdentity,
  exactCloudRunRevisionName,
  extractRevisionBoundRenewalSheetConfig,
  fingerprintRevisionRuntimeConfiguration,
  readVerifiedCloudRunOriginBinding,
  readVerifiedCloudRunRevisionConfiguration,
  readVerifiedRevisionBoundRenewalSheetConfig,
  type CloudRunRevisionReadClient,
  type ExactCloudRunRevisionTarget,
} from "@/lib/production-assurance";

const PROJECT = "pmi-kc-kb-prod";
const SERVICE = "pmi-kc-app";
const REVISION = "pmi-kc-app-candidate-123";
const SHEET_ID = "sheet_identity_12345678901234567890";
const SERVICE_ACCOUNT = `renewal-sheet-reader@${PROJECT}.iam.gserviceaccount.com`;
const SUBJECT = "renewals@pmikcmetro.com";

function revision() {
  return {
    name: `projects/${PROJECT}/locations/us-central1/services/${SERVICE}/revisions/${REVISION}`,
    uid: "output-only",
    createTime: "2026-09-02T12:00:00.000Z",
    containers: [
      {
        image: "us-central1-docker.pkg.dev/example/app@sha256:abc",
        env: [
          { name: "ENVIRONMENT_KIND", value: "production" },
          { name: "RENEWAL_SHEET_ID", value: SHEET_ID },
          { name: "SHEETS_IMPERSONATE_SA", value: SERVICE_ACCOUNT },
          { name: "SHEETS_DWD_SUBJECT", value: SUBJECT },
        ],
      },
    ],
  };
}

function target(value = revision()): ExactCloudRunRevisionTarget {
  return {
    project: PROJECT,
    region: "us-central1",
    service: SERVICE,
    expectedRevision: REVISION,
    expectedConfigurationFingerprint: fingerprintRevisionRuntimeConfiguration(value),
  };
}

function clientFor(data: unknown) {
  const request = vi.fn(async () => ({ data }));
  return {
    client: { request } as unknown as CloudRunRevisionReadClient,
    request,
  };
}

describe("exact Cloud Run revision configuration", () => {
  it("reads only the exact revision resource and verifies its required fingerprint", async () => {
    const value = revision();
    const { client, request } = clientFor(value);
    await expect(
      readVerifiedCloudRunRevisionConfiguration(client, target(value)),
    ).resolves.toBe(value);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: `https://run.googleapis.com/v2/${value.name}`,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("fails closed on a wrong resource name or changed runtime configuration", async () => {
    const value = revision();
    const wrongName = { ...value, name: `${value.name}-other` };
    await expect(
      readVerifiedCloudRunRevisionConfiguration(
        clientFor(wrongName).client,
        target(value),
      ),
    ).rejects.toThrow("revision_identity_mismatch");

    const changed = {
      ...value,
      containers: [{ ...value.containers[0], timeout: "600s" }],
    };
    await expect(
      readVerifiedCloudRunRevisionConfiguration(clientFor(changed).client, target(value)),
    ).rejects.toThrow("revision_configuration_mismatch");
  });

  it("validates every exact target coordinate", () => {
    expect(exactCloudRunRevisionName(target())).toBe(revision().name);
    expect(() =>
      exactCloudRunRevisionName({
        ...target(),
        expectedRevision: "other-service-candidate-123",
      }),
    ).toThrow("revision_target_invalid");
  });
});

describe("exact Cloud Run origin binding", () => {
  const canonicalOrigin = "https://pmi-kc-app-abc-uc.a.run.app";
  const candidateOrigin = "https://cand-abc---pmi-kc-app-abc-uc.a.run.app";
  const predecessorRevision = "pmi-kc-app-predecessor-122";
  const serviceName = `projects/${PROJECT}/locations/us-central1/services/${SERVICE}`;

  function service(trafficStatuses: readonly Record<string, unknown>[]) {
    return {
      name: serviceName,
      uri: canonicalOrigin,
      trafficStatuses,
    };
  }

  it("binds a candidate tag origin to the exact zero-traffic revision and predecessor", async () => {
    const { client, request } = clientFor(
      service([
        { revision: predecessorRevision, percent: 100 },
        { revision: REVISION, percent: 0, tag: "cand-abc", uri: candidateOrigin },
      ]),
    );
    await expect(
      readVerifiedCloudRunOriginBinding(client, {
        project: PROJECT,
        region: "us-central1",
        service: SERVICE,
        expectedRevision: REVISION,
        origin: candidateOrigin,
        phase: "candidate",
      }),
    ).resolves.toEqual({ canonicalOrigin, predecessorRevision });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: `https://run.googleapis.com/v2/${serviceName}`,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("refuses a candidate URL that is not the exact tag URI returned by Cloud Run", async () => {
    const data = service([
      { revision: predecessorRevision, percent: 100 },
      { revision: REVISION, percent: 0, tag: "cand-abc", uri: candidateOrigin },
    ]);
    await expect(
      readVerifiedCloudRunOriginBinding(clientFor(data).client, {
        project: PROJECT,
        region: "us-central1",
        service: SERVICE,
        expectedRevision: REVISION,
        origin: "https://other-tag---pmi-kc-app-abc-uc.a.run.app",
        phase: "candidate",
      }),
    ).rejects.toThrow("candidate_origin_mismatch");
  });

  it("refuses a candidate tag if the named candidate has already received traffic", async () => {
    const data = service([
      { revision: predecessorRevision, percent: 100 },
      { revision: REVISION, percent: 1, tag: "cand-abc", uri: candidateOrigin },
      { revision: REVISION, percent: 0, tag: "cand-abc", uri: candidateOrigin },
    ]);
    await expect(
      readVerifiedCloudRunOriginBinding(clientFor(data).client, {
        project: PROJECT,
        region: "us-central1",
        service: SERVICE,
        expectedRevision: REVISION,
        origin: candidateOrigin,
        phase: "candidate",
      }),
    ).rejects.toThrow("candidate_origin_mismatch");
  });

  it("requires the canonical service origin and exact 100-percent revision after promotion", async () => {
    const promoted = service([{ revision: REVISION, percent: 100 }]);
    await expect(
      readVerifiedCloudRunOriginBinding(clientFor(promoted).client, {
        project: PROJECT,
        region: "us-central1",
        service: SERVICE,
        expectedRevision: REVISION,
        origin: canonicalOrigin,
        phase: "post_promotion",
      }),
    ).resolves.toEqual({ canonicalOrigin, predecessorRevision: null });
    await expect(
      readVerifiedCloudRunOriginBinding(clientFor(promoted).client, {
        project: PROJECT,
        region: "us-central1",
        service: SERVICE,
        expectedRevision: REVISION,
        origin: candidateOrigin,
        phase: "post_promotion",
      }),
    ).rejects.toThrow("canonical_origin_mismatch");
  });
});

describe("revision-bound operating Renewal Sheet identity", () => {
  it("extracts only unique plaintext managed values from the verified revision", async () => {
    const value = revision();
    const expected = {
      spreadsheetId: SHEET_ID,
      impersonateServiceAccount: SERVICE_ACCOUNT,
      dwdSubject: SUBJECT,
    };
    expect(extractRevisionBoundRenewalSheetConfig(value, PROJECT)).toEqual(expected);
    await expect(
      readVerifiedRevisionBoundRenewalSheetConfig(clientFor(value).client, target(value)),
    ).resolves.toEqual(expected);
  });

  it.each([
    [
      "missing",
      (value: ReturnType<typeof revision>) => ({
        ...value,
        containers: [
          {
            ...value.containers[0],
            env: value.containers[0].env.filter(
              (entry) => entry.name !== "RENEWAL_SHEET_ID",
            ),
          },
        ],
      }),
    ],
    [
      "duplicate",
      (value: ReturnType<typeof revision>) => ({
        ...value,
        containers: [
          value.containers[0],
          {
            image: "sidecar",
            env: [{ name: "RENEWAL_SHEET_ID", value: SHEET_ID }],
          },
        ],
      }),
    ],
    [
      "secret-backed",
      (value: ReturnType<typeof revision>) => ({
        ...value,
        containers: [
          {
            ...value.containers[0],
            env: value.containers[0].env.map((entry) =>
              entry.name === "RENEWAL_SHEET_ID"
                ? {
                    name: entry.name,
                    valueSource: { secretKeyRef: { secret: "wrong", version: "1" } },
                  }
                : entry,
            ),
          },
        ],
      }),
    ],
  ])("refuses %s targeted revision environment values", (_label, mutate) => {
    expect(() =>
      extractRevisionBoundRenewalSheetConfig(mutate(revision()), PROJECT),
    ).toThrow("revision_sheet_configuration_invalid");
  });

  it("refuses a foreign service account or non-managed DWD subject", () => {
    const value = revision();
    const replace = (name: string, replacement: string) => ({
      ...value,
      containers: [
        {
          ...value.containers[0],
          env: value.containers[0].env.map((entry) =>
            entry.name === name ? { ...entry, value: replacement } : entry,
          ),
        },
      ],
    });
    expect(() =>
      extractRevisionBoundRenewalSheetConfig(
        replace(
          "SHEETS_IMPERSONATE_SA",
          "renewal-sheet-reader@other-project.iam.gserviceaccount.com",
        ),
        PROJECT,
      ),
    ).toThrow("revision_sheet_identity_invalid");
    expect(() =>
      extractRevisionBoundRenewalSheetConfig(
        replace("SHEETS_DWD_SUBJECT", "personal@example.com"),
        PROJECT,
      ),
    ).toThrow("revision_sheet_identity_invalid");
  });

  it("requires every Sheet batch response to echo the exact configured identity", () => {
    expect(() =>
      assertRenewalSheetResponseIdentity({ spreadsheetId: SHEET_ID }, SHEET_ID),
    ).not.toThrow();
    for (const response of [{}, { spreadsheetId: `${SHEET_ID}_other` }]) {
      expect(() => assertRenewalSheetResponseIdentity(response, SHEET_ID)).toThrow(
        "renewal_sheet_identity_mismatch",
      );
    }
  });
});
