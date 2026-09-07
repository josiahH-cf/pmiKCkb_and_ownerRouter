import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// S112 hard gate: nothing under scripts/auth may enter a credential, and nothing may echo a token.
// The runner's browser automation is allowed to click the expected Google account tile and nothing
// else on a Google page; passwords, one-time codes, passkeys, and CAPTCHAs are always a person's.

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const AUTH_DIR = join(ROOT, "scripts", "auth");

function authFiles() {
  return readdirSync(AUTH_DIR)
    .map((name) => join(AUTH_DIR, name))
    .filter((file) => statSync(file).isFile());
}

describe("scripts/auth never enters or echoes a credential", () => {
  it("has the automated login scripts present", () => {
    const names = authFiles().map((file) => file.replaceAll("\\", "/").split("/").pop());
    for (const required of [
      "identities.mjs",
      "plan.mjs",
      "ensure.mjs",
      "enroll.ps1",
      "enroll.sh",
      "google-step.ts",
      "browser.ts",
      "canary-session.ts",
      "enroll-canary.ts",
    ]) {
      expect(names, `${required} missing from scripts/auth`).toContain(required);
    }
  });

  it("uses no Playwright typing API (a password field may be detected, never filled)", () => {
    const forbidden = [
      /\.fill\(/,
      /\.type\(/,
      /\.press\(/,
      /\.insertText\(/,
      /keyboard\./,
      /pressSequentially/,
      /setInputFiles/,
    ];
    for (const file of authFiles()) {
      if (!/\.(ts|mjs|js)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${file} matches ${pattern}`).toBe(false);
      }
    }
  });

  it("never asks a person for a password or one-time code in the enrollment script", () => {
    const text = readFileSync(join(AUTH_DIR, "enroll.ps1"), "utf8");
    expect(/Read-Host[^\n]*(password|passcode|otp|code)/i.test(text)).toBe(false);
    expect(/-AsSecureString/.test(text)).toBe(false);
  });

  it("discards gcloud token output instead of capturing it", () => {
    const text = readFileSync(join(AUTH_DIR, "ensure.mjs"), "utf8");
    // Every token mint must run with stdout discarded; the exit code is the only thing read.
    const mints = [...text.matchAll(/print-access-token/g)];
    expect(mints.length).toBeGreaterThan(0);
    expect(text).toContain("TOKEN_PROBE_STDIO");
    expect(/console\.(log|error)\([^)]*token[^)]*\)/i.test(text)).toBe(false);
  });
});
