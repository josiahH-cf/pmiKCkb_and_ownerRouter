import { describe, expect, it } from "vitest";

import { resolveIdentities } from "../../scripts/auth/identities.mjs";
import {
  assessCredentials,
  canaryEnrollCommand,
  chooseGcloudStore,
  enrollCommand,
  exitCodeFor,
  formatStatus,
  parseNeed,
  redact,
} from "../../scripts/auth/plan.mjs";

// S112 (unattended authentication): the pure decision core behind `npm run auth:ensure`. Every
// probe state must map to exactly one of: ok, a browser-free repair, or one exact human step. The
// runner never opens a browser, types a credential, or copies a token from these decisions.

const identities = resolveIdentities({});

const attendedProbe = Object.freeze({
  platform: "linux",
  wsl: true,
  googleAppCreds: undefined,
  gcloud: {
    available: true,
    activeAccount: "josiah@pmikcmetro.com",
    impersonation: null,
    storeAccounts: ["josiah@pmikcmetro.com"],
    tokenFresh: true,
  },
  adc: {
    present: true,
    fresh: true,
    principal: "josiah@pmikcmetro.com",
    errorKind: null,
  },
  env: { present: true, missingKeys: [] },
  gh: { available: true, loggedIn: true, tokenEnv: false },
  canary: [],
});

const unattendedProbe = Object.freeze({
  ...attendedProbe,
  platform: "linux",
  wsl: true,
  gcloud: {
    available: true,
    activeAccount: identities.localPrincipal,
    impersonation: null,
    storeAccounts: [identities.localPrincipal],
    tokenFresh: true,
  },
  adc: {
    present: true,
    fresh: true,
    principal: identities.localPrincipal,
    errorKind: null,
  },
});

function item(result, credential) {
  return result.items.find((entry) => entry.credential === credential);
}

describe("parseNeed", () => {
  it("defaults to the four non-browser credentials and validates names", () => {
    expect(parseNeed(undefined)).toEqual(["gcloud", "adc", "env", "gh"]);
    expect(parseNeed("canary,gcloud")).toEqual(["canary", "gcloud"]);
    expect(() => parseNeed("gcloud,password")).toThrow(/unknown credential/);
  });
});

describe("assessCredentials (attended, today's owner login)", () => {
  it("reports every fresh managed credential as ok and names the identity kind", () => {
    const result = assessCredentials(attendedProbe, { identities, need: parseNeed() });
    expect(item(result, "gcloud").state).toBe("ok");
    expect(item(result, "gcloud").identity).toBe("josiah@pmikcmetro.com");
    expect(item(result, "gcloud").kind).toBe("attended");
    expect(item(result, "adc").state).toBe("ok");
    expect(item(result, "env").state).toBe("ok");
    expect(item(result, "gh").state).toBe("ok");
    expect(item(result, "canary").state).toBe("skipped");
    expect(result.repairs).toEqual([]);
    expect(exitCodeFor(result.items)).toBe(0);
  });

  it("blocks a stale managed CLI token with the attended enroll command, never a browser of its own", () => {
    const result = assessCredentials(
      { ...attendedProbe, gcloud: { ...attendedProbe.gcloud, tokenFresh: false } },
      { identities, need: parseNeed() },
    );
    const gcloud = item(result, "gcloud");
    expect(gcloud.state).toBe("blocked");
    expect(gcloud.humanStep).toBe(
      enrollCommand({
        attended: true,
        account: "josiah@pmikcmetro.com",
        platform: "linux",
      }),
    );
    expect(gcloud.humanStep).toContain("npm run auth:enroll");
    expect(exitCodeFor(result.items)).toBe(2);
  });

  it("blocks a personal account and a key file with distinct reasons", () => {
    const personal = assessCredentials(
      {
        ...attendedProbe,
        gcloud: { ...attendedProbe.gcloud, activeAccount: "someone@gmail.com" },
      },
      { identities, need: parseNeed() },
    );
    expect(item(personal, "gcloud").state).toBe("blocked");
    expect(item(personal, "gcloud").code).toBe("personal_identity");

    const keyFile = assessCredentials(
      { ...attendedProbe, googleAppCreds: "C:/keys/sa.json" },
      { identities, need: parseNeed() },
    );
    expect(item(keyFile, "gcloud").state).toBe("blocked");
    expect(item(keyFile, "gcloud").code).toBe("key_file_forbidden");
    expect(item(keyFile, "adc").state).toBe("blocked");
    expect(item(keyFile, "adc").code).toBe("key_file_forbidden");
  });

  it("blocks a stale or missing ADC with one enroll step instead of copying a token", () => {
    for (const adc of [
      { present: true, fresh: false, principal: null, errorKind: "reauth" },
      { present: false, fresh: false, principal: null, errorKind: "missing" },
    ]) {
      const result = assessCredentials(
        { ...attendedProbe, adc },
        { identities, need: parseNeed() },
      );
      const entry = item(result, "adc");
      expect(entry.state).toBe("blocked");
      expect(entry.humanStep).toContain("npm run auth:enroll");
      expect(result.repairs).toEqual([]);
    }
  });

  it("names the missing RentVine keys without printing any value", () => {
    const result = assessCredentials(
      { ...attendedProbe, env: { present: true, missingKeys: ["RENTVINE_API_SECRET"] } },
      { identities, need: parseNeed() },
    );
    const env = item(result, "env");
    expect(env.state).toBe("blocked");
    expect(env.detail).toContain("RENTVINE_API_SECRET");
  });

  it("accepts GH_TOKEN as a logged-in GitHub identity and blocks a logged-out gh", () => {
    const token = assessCredentials(
      { ...attendedProbe, gh: { available: true, loggedIn: true, tokenEnv: true } },
      { identities, need: parseNeed() },
    );
    expect(item(token, "gh").state).toBe("ok");
    const out = assessCredentials(
      { ...attendedProbe, gh: { available: true, loggedIn: false, tokenEnv: false } },
      { identities, need: parseNeed() },
    );
    expect(item(out, "gh").state).toBe("blocked");
    expect(item(out, "gh").humanStep).toBe("gh auth login");
  });
});

// The 2026-09-08 owner decision supersedes the old automation/impersonation assertions.
// Preserve negative identity coverage: the retired identity and every unexpected principal refuse.
describe("assessCredentials (authorized local unattended account)", () => {
  it("accepts the exact owner account without impersonation", () => {
    const result = assessCredentials(unattendedProbe, {
      identities,
      need: parseNeed(),
      unattended: true,
    });
    expect(item(result, "gcloud").state).toBe("ok");
    expect(item(result, "gcloud").kind).toBe("unattended");
    expect(item(result, "adc").identity).toBe(identities.localPrincipal);
    expect(exitCodeFor(result.items)).toBe(0);
  });
  it("refuses config drift without switching an identity or setting impersonation", () => {
    const result = assessCredentials(
      {
        ...unattendedProbe,
        gcloud: {
          ...unattendedProbe.gcloud,
          activeAccount: "pmi-runner@pmikcmetro.com",
          impersonation: "pmi-kc-automation@pmi-kc-kb-prod.iam.gserviceaccount.com",
        },
      },
      { identities, need: parseNeed(), unattended: true },
    );
    expect(item(result, "gcloud").state).toBe("blocked");
    expect(result.repairs).toEqual([]);
  });
  it("requires enrollment when a local CLI identity is absent", () => {
    const result = assessCredentials(
      { ...unattendedProbe, gcloud: { available: true } },
      {
        identities,
        need: parseNeed(),
        unattended: true,
      },
    );
    expect(item(result, "gcloud").state).toBe("blocked");
    expect(item(result, "gcloud").humanStep).toBe(enrollCommand());
  });
  it("refuses a service account as local ADC, including the retired automation principal", () => {
    for (const principal of ["pmi-kc-automation", "other"].map(
      (name) => `${name}@pmi-kc-kb-prod.iam.gserviceaccount.com`,
    )) {
      const result = assessCredentials(
        {
          ...unattendedProbe,
          adc: {
            present: true,
            fresh: true,
            principal,
          },
        },
        { identities, need: parseNeed(), unattended: true },
      );
      expect(item(result, "adc").state).toBe("blocked");
      expect(result.repairs).toEqual([]);
    }
  });
});

describe("assessCredentials (canary sessions)", () => {
  const admin = {
    label: "admin",
    profile: "/home/josiah/pmi-assurance/canary-admin",
    origin: "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app",
    email: "canary-admin@pmikcmetro.com",
  };

  it("treats a silent re-sign-in as the repair and a Google prompt as one human step", () => {
    const signedIn = assessCredentials(
      { ...attendedProbe, canary: [{ ...admin, result: "signed_in", role: "Admin" }] },
      { identities, need: ["canary"] },
    );
    expect(item(signedIn, "canary").state).toBe("ok");
    expect(item(signedIn, "canary").detail).toContain("Admin");

    const human = assessCredentials(
      {
        ...attendedProbe,
        canary: [
          {
            ...admin,
            result: "human_required",
            url: "https://accounts.google.com/v3/signin/identifier",
          },
        ],
      },
      { identities, need: ["canary"] },
    );
    const entry = item(human, "canary");
    expect(entry.state).toBe("blocked");
    expect(entry.humanStep).toBe(canaryEnrollCommand(admin));
    expect(entry.humanStep).toContain("npm run auth:enroll-canary");
    expect(entry.humanStep).toContain("--email=canary-admin@pmikcmetro.com");
  });

  it("blocks when canary sessions are needed but no profile was named", () => {
    const result = assessCredentials(
      { ...attendedProbe, canary: [] },
      { identities, need: ["canary"] },
    );
    expect(item(result, "canary").state).toBe("blocked");
    expect(item(result, "canary").code).toBe("canary_profile_required");
  });
});

describe("enrollCommand", () => {
  it("names one WSL recovery command without interpolating another identity", () => {
    for (const platform of ["win32", "linux"]) {
      expect(enrollCommand({ platform, account: "a@pmikcmetro.com" })).toBe(
        "npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com",
      );
    }
  });
});

describe("chooseGcloudStore", () => {
  it("honors an explicit CLOUDSDK_CONFIG", () => {
    expect(chooseGcloudStore({ cloudsdkConfig: "/tmp/store" })).toEqual({
      store: "env",
      cloudsdkConfig: "/tmp/store",
    });
  });

  // The Google client libraries read ADC only from the shell's own home store, so the CLI is never
  // redirected to another store: each shell (Windows, WSL) is enrolled on its own.
  it("uses the shell's own store otherwise and never redirects to another one", () => {
    expect(chooseGcloudStore({ cloudsdkConfig: undefined })).toEqual({
      store: "local",
      cloudsdkConfig: undefined,
    });
    expect(chooseGcloudStore({ cloudsdkConfig: "   " })).toEqual({
      store: "local",
      cloudsdkConfig: undefined,
    });
    expect(chooseGcloudStore()).toEqual({ store: "local", cloudsdkConfig: undefined });
  });
});

describe("redact and formatStatus", () => {
  it("strips every token shape from free text", () => {
    const text =
      "ya29.a0AfB_byC-token 1//0gRefreshToken-abc ops_eyJzaWduSW5BZGRyZXNz gho_16Cabcdefg " +
      'ghp_abcdefghijklmnop AIzaSyA1234567890abcdefghijklmnopqrstuvw "private_key": "-----BEGIN"';
    const out = redact(text);
    for (const secret of ["ya29.", "1//0g", "ops_", "gho_", "ghp_", "AIzaSy", "BEGIN"]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("[redacted]");
  });

  it("renders one line per credential with identity and state, never a token", () => {
    const result = assessCredentials(
      {
        ...attendedProbe,
        gcloud: {
          ...attendedProbe.gcloud,
          tokenFresh: false,
          error: "ya29.leaked-token invalid_rapt",
        },
      },
      { identities, need: parseNeed() },
    );
    const lines = formatStatus(result.items, { unattended: false });
    expect(lines.some((line) => line.startsWith("gcloud"))).toBe(true);
    expect(lines.join("\n")).toContain("josiah@pmikcmetro.com");
    expect(lines.join("\n")).not.toContain("ya29.");
    expect(lines.join("\n")).toContain("npm run auth:enroll");
  });
});
