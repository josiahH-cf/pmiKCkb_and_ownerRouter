import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// Execute the real shell entry point with local command fakes. No Google process,
// credential store, authorization URL, or authorization code is used by this test.
function enroll(options = {}) {
  const fixture = mkdtempSync(join(tmpdir(), "pmi-enrollment-test-"));
  const command = (name, script) =>
    writeFileSync(join(fixture, name), `#!/bin/bash\n${script}\n`, {
      mode: 0o700,
    });
  try {
    command("uname", "echo Linux");
    command("rg", "exit 0");
    command(
      "gcloud",
      `printf 'gcloud %s\\n' "$*" >> "$PMI_TEST_FIXTURE/calls"
if [[ "$1" == config ]]; then
  if IFS= read -r -t 1 ignored; then
    echo config-consumed-input >> "$PMI_TEST_FIXTURE/calls"
  fi
  exit 0
fi
if [[ "$*" == 'auth login '* ]]; then
  touch "$PMI_TEST_FIXTURE/cli-enrolled"
  exit 0
fi
if [[ "$*" == 'auth application-default login '* ]]; then
  if IFS= read -r -t 1 ignored; then
    echo google-prompt-received-input >> "$PMI_TEST_FIXTURE/calls"
  fi
  exit "$PMI_TEST_LOGIN_RESULT"
fi
exit 91`,
    );
    command(
      "node",
      `printf 'node %s\\n' "$*" >> "$PMI_TEST_FIXTURE/calls"
if IFS= read -r -t 1 ignored; then
  echo check-consumed-input >> "$PMI_TEST_FIXTURE/calls"
fi
case "$*" in
  'scripts/auth/ensure.mjs --need=gcloud --quiet')
    [[ "$PMI_TEST_NEEDS_CLI" == 0 || -f "$PMI_TEST_FIXTURE/cli-enrolled" ]] ;;
  'scripts/auth/ensure.mjs --need=adc --quiet')
    [[ "$PMI_TEST_NEEDS_ADC" == 0 ]] ;;
  'scripts/auth/verify-enrollment.mjs') exit 0 ;;
  'scripts/auth/ensure.mjs --need=gcloud,adc,env,gh --unattended') exit 0 ;;
  *) exit 92 ;;
esac`,
    );
    const result = spawnSync(
      "bash",
      ["scripts/auth/enroll.sh", ...(options.args ?? [])],
      {
        cwd: root,
        encoding: "utf8",
        input: "terminal-input-fixture\n",
        timeout: 10_000,
        env: {
          ...process.env,
          PATH: `${fixture}:/usr/bin:/bin`,
          GOOGLE_APPLICATION_CREDENTIALS: "",
          CLOUDSDK_CONFIG: "",
          CLOUDSDK_AUTH_ACCESS_TOKEN: "",
          CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: "",
          PMI_TEST_FIXTURE: fixture,
          PMI_TEST_NEEDS_CLI: options.needsCli ? "1" : "0",
          PMI_TEST_NEEDS_ADC: options.needsAdc === false ? "0" : "1",
          PMI_TEST_LOGIN_RESULT: String(options.loginResult ?? 0),
        },
      },
    );
    return {
      ...result,
      calls: readFileSync(join(fixture, "calls"), "utf8").trim().split("\n"),
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe.skipIf(process.platform !== "linux")("interactive WSL enrollment", () => {
  it("reserves terminal input for Google's prompt and checks existing CLI only once", () => {
    const result = enroll();
    expect(result.status, result.output).toBe(0);
    expect(result.calls).toContain("google-prompt-received-input");
    expect(result.calls).not.toContain("config-consumed-input");
    expect(result.calls).not.toContain("check-consumed-input");
    expect(
      result.calls.filter((call) => call.includes("--need=gcloud --quiet")),
    ).toHaveLength(1);
    expect(result.calls.slice(-2)).toEqual([
      "node scripts/auth/verify-enrollment.mjs",
      "node scripts/auth/ensure.mjs --need=gcloud,adc,env,gh --unattended",
    ]);
  });

  it("verifies newly enrolled CLI before beginning ADC enrollment", () => {
    const result = enroll({ needsCli: true });
    expect(result.status, result.output).toBe(0);
    const cliLogin = result.calls.indexOf(
      "gcloud auth login josiah@pmikcmetro.com --no-launch-browser",
    );
    expect(cliLogin).toBeGreaterThan(-1);
    expect(result.calls[cliLogin + 1]).toBe(
      "node scripts/auth/ensure.mjs --need=gcloud --quiet",
    );
    expect(result.calls).toContain(
      "gcloud auth application-default login --account=josiah@pmikcmetro.com --no-launch-browser",
    );
  });

  it.each([1, 130])(
    "stops after failed or cancelled Google enrollment (%s) without binding or retrying",
    (loginResult) => {
      const result = enroll({ loginResult });
      expect(result.status).not.toBe(0);
      expect(result.calls.filter((call) => call.startsWith("gcloud auth "))).toHaveLength(
        1,
      );
      expect(result.calls.join("\n")).not.toContain("verify-enrollment.mjs");
      expect(result.calls.join("\n")).not.toContain("--unattended");
      expect(result.output).toContain("fresh link");
      expect(result.output).toContain("same running command");
    },
  );

  it("finishes without Google login when both credential checks already pass", () => {
    const result = enroll({ needsAdc: false });
    expect(result.status, result.output).toBe(0);
    expect(result.calls.join("\n")).not.toContain("gcloud auth ");
    expect(result.calls.join("\n")).not.toContain("verify-enrollment.mjs");
    expect(result.calls.at(-1)).toBe(
      "node scripts/auth/ensure.mjs --need=gcloud,adc,env,gh --unattended",
    );
  });

  it("uses Google's browser callback for both enrollments when requested", () => {
    const result = enroll({ needsCli: true, args: ["--browser"] });
    expect(result.status, result.output).toBe(0);
    expect(result.calls.filter((call) => call.startsWith("gcloud auth "))).toEqual([
      "gcloud auth login josiah@pmikcmetro.com --launch-browser",
      "gcloud auth application-default login --account=josiah@pmikcmetro.com --launch-browser",
    ]);
    expect(result.output).toContain("no code copying is needed");
    expect(result.output).not.toContain("paste that link's code");
    expect(result.calls.slice(-2)).toEqual([
      "node scripts/auth/verify-enrollment.mjs",
      "node scripts/auth/ensure.mjs --need=gcloud,adc,env,gh --unattended",
    ]);
  });

  it("stops failed browser enrollment before binding and keeps its recovery command in browser mode", () => {
    const result = enroll({ loginResult: 1, args: ["--browser"] });
    expect(result.status).not.toBe(0);
    expect(result.calls.filter((call) => call.startsWith("gcloud auth "))).toHaveLength(
      1,
    );
    expect(result.calls.join("\n")).not.toContain("verify-enrollment.mjs");
    expect(result.output).toContain("npm run auth:session -- --browser");
    expect(result.output).not.toContain("fresh link and code");
  });
});
