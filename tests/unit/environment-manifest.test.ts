import { describe, expect, it } from "vitest";

import {
  assertEnvironmentIsolation,
  buildEnvironmentProvisioningPlan,
  checkEnvironmentIsolation,
  ISOLATED_RESOURCE_FIELD_NAMES,
  type EnvironmentResourceManifest,
  type IsolatedResourceField,
} from "@/lib/environment/manifest";

// Illustrative identifiers only. The exact Demo values are an owner provisioning input and are
// never invented in code, docs, or tests, and never inferred from the existing service name.
const DEMO: EnvironmentResourceManifest = {
  environmentKind: "demo",
  projectId: "example-demo-project",
  serviceName: "example-demo-service",
  firestoreDatabaseId: "demo-db",
  storageTarget: "example-demo-project-storage",
  queueTopic: "projects/example-demo-project/topics/demo-work",
  secretBoundary: "projects/example-demo-project/secrets",
  oauthRedirectUri: "https://demo.example.invalid/api/vendor/oauth/callback",
  oauthAudience: "demo-audience",
  runtimeServiceAccount: "runtime@example-demo-project.iam.gserviceaccount.com",
};

const PRODUCTION: EnvironmentResourceManifest = {
  environmentKind: "production",
  projectId: "example-prod-project",
  serviceName: "example-prod-service",
  firestoreDatabaseId: "(default)",
  storageTarget: "example-prod-project-storage",
  queueTopic: "projects/example-prod-project/topics/prod-work",
  secretBoundary: "projects/example-prod-project/secrets",
  oauthRedirectUri: "https://app.example.invalid/api/vendor/oauth/callback",
  oauthAudience: "prod-audience",
  runtimeServiceAccount: "runtime@example-prod-project.iam.gserviceaccount.com",
};

describe("environment isolation (AC-S40-2)", () => {
  it("accepts a fully independent manifest pair", () => {
    expect(checkEnvironmentIsolation(DEMO, PRODUCTION)).toEqual({ ok: true });
    expect(() => assertEnvironmentIsolation(DEMO, PRODUCTION)).not.toThrow();
  });

  it("rejects a shared value in EVERY isolated resource class and names the field", () => {
    for (const field of ISOLATED_RESOURCE_FIELD_NAMES) {
      const collided: EnvironmentResourceManifest = {
        ...DEMO,
        [field]: PRODUCTION[field],
      };
      const result = checkEnvironmentIsolation(collided, PRODUCTION);
      expect(result.ok, `${field} collision must be rejected`).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.conflicts.map((conflict) => conflict.field)).toContain(field);
    }
  });

  it("covers the seven resource classes the suite requires", () => {
    // project/service, Firestore database/namespace, storage, queue/topic, Secret Manager,
    // OAuth redirect/audience, runtime identity.
    expect(ISOLATED_RESOURCE_FIELD_NAMES).toEqual([
      "projectId",
      "serviceName",
      "firestoreDatabaseId",
      "storageTarget",
      "queueTopic",
      "secretBoundary",
      "oauthRedirectUri",
      "oauthAudience",
      "runtimeServiceAccount",
    ]);
  });

  it("reports every conflict at once rather than stopping at the first", () => {
    const result = checkEnvironmentIsolation(
      {
        ...DEMO,
        firestoreDatabaseId: PRODUCTION.firestoreDatabaseId,
        oauthAudience: PRODUCTION.oauthAudience,
        runtimeServiceAccount: PRODUCTION.runtimeServiceAccount,
      },
      PRODUCTION,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    const fields = result.conflicts.map((conflict) => conflict.field);
    expect(fields).toContain("firestoreDatabaseId");
    expect(fields).toContain("oauthAudience");
    expect(fields).toContain("runtimeServiceAccount");
  });

  it("ignores case and surrounding whitespace when comparing", () => {
    const result = checkEnvironmentIsolation(
      { ...DEMO, oauthAudience: `  ${PRODUCTION.oauthAudience.toUpperCase()} ` },
      PRODUCTION,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a missing value instead of treating two blanks as different", () => {
    const result = checkEnvironmentIsolation(
      { ...DEMO, storageTarget: "   " },
      PRODUCTION,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.conflicts.some((conflict) => conflict.field === "storageTarget")).toBe(
      true,
    );
    expect(result.conflicts.map((c) => c.message).join(" ")).toMatch(/not set for Demo/);
  });

  it("catches a distinct-looking Demo identifier that still lives in the Production project", () => {
    const result = checkEnvironmentIsolation(
      {
        ...DEMO,
        // Different string, same blast radius: the Demo queue lives in the Production project.
        queueTopic: "projects/example-prod-project/topics/demo-work",
      },
      PRODUCTION,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    const alias = result.conflicts.find(
      (conflict) => conflict.kind === "cross_environment_alias",
    );
    expect(alias?.field).toBe("queueTopic");
    expect(alias?.message).toMatch(/resolves inside the Production project/);
  });

  it("catches a Production runtime identity that lives in the Demo project", () => {
    const result = checkEnvironmentIsolation(DEMO, {
      ...PRODUCTION,
      runtimeServiceAccount: "runtime@example-demo-project.iam.gserviceaccount.com",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(
      result.conflicts.some(
        (conflict) =>
          conflict.kind === "cross_environment_alias" &&
          conflict.field === "runtimeServiceAccount",
      ),
    ).toBe(true);
  });

  it("does not flag an identifier that merely shares a word with the other project", () => {
    // "storage" and "example" appear in both, but neither manifest contains the other's project
    // id as a run of segments, so this is a genuinely independent pair.
    const result = checkEnvironmentIsolation(
      { ...DEMO, storageTarget: "example-rehearsal-storage" },
      { ...PRODUCTION, storageTarget: "example-operations-storage" },
    );
    expect(result.ok).toBe(true);
  });

  it("fails closed when one project id is a segment-prefix of the other's resource name", () => {
    // "example-prod-project-storage" contains the segments of "example-prod". A bucket with that
    // name most likely belongs to "example-prod-project", but nothing in the identifier proves
    // it, and a preflight that guesses wrong shares infrastructure between environments. It is
    // reported so the operator names the resource unambiguously rather than silently accepted.
    const result = checkEnvironmentIsolation(
      { ...DEMO, projectId: "example-prod" },
      { ...PRODUCTION, storageTarget: "example-prod-project-storage" },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(
      result.conflicts.some(
        (conflict) =>
          conflict.kind === "cross_environment_alias" &&
          conflict.field === "storageTarget",
      ),
    ).toBe(true);
  });

  it("refuses two manifests that are not one Demo and one Production", () => {
    expect(
      checkEnvironmentIsolation(DEMO, { ...PRODUCTION, environmentKind: "demo" }).ok,
    ).toBe(false);
    expect(
      checkEnvironmentIsolation({ ...DEMO, environmentKind: "production" }, PRODUCTION)
        .ok,
    ).toBe(false);
  });

  it("throws with every conflicting field named", () => {
    expect(() =>
      assertEnvironmentIsolation(
        { ...DEMO, projectId: PRODUCTION.projectId },
        PRODUCTION,
      ),
    ).toThrow(/cloud project/);
  });
});

describe("provisioning plan emits no command on a collision (AC-S40-2)", () => {
  const buildCommands = (manifest: EnvironmentResourceManifest) => [
    `gcloud run deploy ${manifest.serviceName} --project=${manifest.projectId}`,
  ];

  it("emits commands only for an independent pair", () => {
    const plan = buildEnvironmentProvisioningPlan(DEMO, PRODUCTION, buildCommands);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("unreachable");
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]).toContain(DEMO.serviceName);
  });

  it("emits no executable command for any single-field collision", () => {
    for (const field of ISOLATED_RESOURCE_FIELD_NAMES) {
      const plan = buildEnvironmentProvisioningPlan(
        { ...DEMO, [field]: PRODUCTION[field] },
        PRODUCTION,
        buildCommands,
      );
      expect(plan.ok, `${field} collision must emit no command`).toBe(false);
      expect(plan).not.toHaveProperty("commands");
    }
  });

  it("never invokes the command builder when the manifest is refused", () => {
    let invoked = 0;
    buildEnvironmentProvisioningPlan(
      { ...DEMO, projectId: PRODUCTION.projectId },
      PRODUCTION,
      (manifest) => {
        invoked += 1;
        return buildCommands(manifest);
      },
    );
    expect(invoked).toBe(0);
  });
});

describe("isolation field coverage is enforced, not assumed", () => {
  it("fails if a new isolated field is added without a collision case", () => {
    // Guards against a future field being added to the manifest type but never compared.
    const fields = new Set<IsolatedResourceField>(ISOLATED_RESOURCE_FIELD_NAMES);
    const manifestKeys = Object.keys(DEMO).filter((key) => key !== "environmentKind");
    expect(manifestKeys.sort()).toEqual([...fields].sort());
  });
});
