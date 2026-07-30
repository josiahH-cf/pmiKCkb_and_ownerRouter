import { describe, expect, it } from "vitest";

import { isActionExecutable } from "../../lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "../../lib/integrations/action-registry-seed";
import { normalizeGmailSubject } from "../../lib/gmail-runtime/subject";
import {
  ACTION_RUNTIME_REQUIREMENTS,
  projectActionRuntimeRequirements,
  validateExecutableActionRuntimeRequirements,
} from "../../scripts/action-runtime-requirements.mjs";

const project = "pmi-kc-kb-prod";
const validDwdServiceAccount = `gmail-dwd@${project}.iam.gserviceaccount.com`;
const validRuntime = {
  GCP_PROJECT_ID: project,
  GMAIL_DWD_SA: validDwdServiceAccount,
  KB_APPROVAL_SENDER: "ops@pmikcmetro.com",
};

describe("action runtime requirements", () => {
  it("mirrors the committed executable state for every mapped action key", () => {
    for (const [actionKey, requirement] of Object.entries(ACTION_RUNTIME_REQUIREMENTS)) {
      expect(
        requirement.mirroredExecutable,
        `${actionKey} runtime requirement projection drifted from the committed Action Registry`,
      ).toBe(isActionExecutable(actionKey, ACTION_REGISTRY_SEED));
    }
  });

  it("maps both sender-dependent actions to one exact managed mailbox", () => {
    expect(Object.keys(ACTION_RUNTIME_REQUIREMENTS).sort()).toEqual([
      "internal.transactional_notice.send",
      "vendor.account.invite",
    ]);

    for (const action of Object.values(ACTION_RUNTIME_REQUIREMENTS)) {
      expect(action.requirements).toEqual([
        {
          name: "KB_APPROVAL_SENDER",
          kind: "managed_pmikcmetro_mailbox",
          cardinality: "exactly_one",
        },
        {
          name: "GMAIL_DWD_SA",
          kind: "project_service_account",
          cardinality: "exactly_one",
        },
      ]);
    }
  });

  it("rejects a blank, external, multiple, or placeholder sender for an executable action", () => {
    for (const sender of [
      "",
      "operator@example.com",
      "one@pmikcmetro.com,two@pmikcmetro.com",
      "one;two@pmikcmetro.com",
      ".operator@pmikcmetro.com",
      "operator..alerts@pmikcmetro.com",
      `${"a".repeat(65)}@pmikcmetro.com`,
      "<sender>@pmikcmetro.com",
      "change-me@pmikcmetro.com",
    ]) {
      const result = validateExecutableActionRuntimeRequirements({
        ...validRuntime,
        KB_APPROVAL_SENDER: sender,
      });

      expect(result.ok, sender).toBe(false);
      expect(result.errors, sender).toHaveLength(1);
      expect(result.errors[0], sender).toContain("KB_APPROVAL_SENDER");
      expect(result.errors[0], sender).toContain("internal.transactional_notice.send");
    }
  });

  it("accepts one canonicalizable internal sender and ignores a closed action", () => {
    expect(
      validateExecutableActionRuntimeRequirements({
        ...validRuntime,
        KB_APPROVAL_SENDER: "  Ops@PMIKCMetro.com  ",
      }),
    ).toEqual({ errors: [], ok: true });

    const onlyClosedVendor = {
      "vendor.account.invite": ACTION_RUNTIME_REQUIREMENTS["vendor.account.invite"],
    };
    expect(validateExecutableActionRuntimeRequirements({}, onlyClosedVendor)).toEqual({
      errors: [],
      ok: true,
    });
  });

  it("keeps deployment readiness in parity with the concrete Gmail subject boundary", () => {
    for (const sender of [
      "ops@pmikcmetro.com",
      "Ops.Alerts+night@PMIKCMetro.com",
      "",
      "operator@example.com",
      "one@pmikcmetro.com,two@pmikcmetro.com",
      "one;two@pmikcmetro.com",
      ".operator@pmikcmetro.com",
      "operator..alerts@pmikcmetro.com",
      "operator.@pmikcmetro.com",
      `${"a".repeat(65)}@pmikcmetro.com`,
      "operator@sub.pmikcmetro.com",
    ]) {
      const projected = validateExecutableActionRuntimeRequirements({
        ...validRuntime,
        KB_APPROVAL_SENDER: sender,
      }).ok;
      let concrete = true;
      try {
        normalizeGmailSubject(sender);
      } catch {
        concrete = false;
      }

      expect(projected, sender).toBe(concrete);
    }
  });

  it("starts enforcing the vendor sender automatically when its mirrored gate moves", () => {
    const vendor = ACTION_RUNTIME_REQUIREMENTS["vendor.account.invite"];
    const futureProjection = {
      "vendor.account.invite": {
        ...vendor,
        mirroredExecutable: true,
      },
    };

    const result = validateExecutableActionRuntimeRequirements(
      { ...validRuntime, KB_APPROVAL_SENDER: "" },
      futureProjection,
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([expect.stringContaining("vendor.account.invite")]);
  });

  it("requires the Gmail DWD identity to belong to the configured project", () => {
    for (const serviceAccount of [
      "",
      "gmail-dwd@example.com",
      "gmail-dwd@another-project.iam.gserviceaccount.com",
      "gmail;dwd@pmi-kc-kb-prod.iam.gserviceaccount.com",
      "one@pmi-kc-kb-prod.iam.gserviceaccount.com,two@pmi-kc-kb-prod.iam.gserviceaccount.com",
    ]) {
      const result = validateExecutableActionRuntimeRequirements({
        ...validRuntime,
        GMAIL_DWD_SA: serviceAccount,
      });

      expect(result.ok, serviceAccount).toBe(false);
      expect(result.errors, serviceAccount).toEqual([
        expect.stringContaining("GMAIL_DWD_SA"),
      ]);
    }
  });

  it("projects the open internal action as inert with the exact missing variable or active", () => {
    expect(
      projectActionRuntimeRequirements({
        ...validRuntime,
        KB_APPROVAL_SENDER: "",
      }),
    ).toEqual({
      runtime_active_keys: [],
      runtime_inert: [
        {
          key: "internal.transactional_notice.send",
          missing_runtime_variables: ["KB_APPROVAL_SENDER"],
        },
      ],
    });

    expect(
      projectActionRuntimeRequirements({
        ...validRuntime,
        KB_APPROVAL_SENDER: "Ops@PMIKCMetro.com",
      }),
    ).toEqual({
      runtime_active_keys: ["internal.transactional_notice.send"],
      runtime_inert: [],
    });
  });

  it("uses an actual executable-by-key projection without reopening omitted keys", () => {
    expect(
      projectActionRuntimeRequirements(validRuntime, {
        "internal.transactional_notice.send": false,
        "vendor.account.invite": true,
      }),
    ).toEqual({
      runtime_active_keys: ["vendor.account.invite"],
      runtime_inert: [],
    });

    expect(projectActionRuntimeRequirements(validRuntime, {})).toEqual({
      runtime_active_keys: [],
      runtime_inert: [],
    });
  });
});
