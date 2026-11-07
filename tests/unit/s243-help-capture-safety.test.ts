import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { requireLoopbackRehearsalOrigin } from "@/scripts/lib/help-rehearsal-origin.mjs";

// S243 AC-S243-3 / ARCH-S243-2 and the static half of AC-S243-8: the help capture script and its
// browser checks run only against the isolated synthetic rehearsal. The refused-connection log of
// each run is the runtime half, recorded with the capture evidence.

const capture = readFileSync(
  join(process.cwd(), "scripts/capture-help-screenshots.mjs"),
  "utf8",
);
const launcher = readFileSync(
  join(process.cwd(), "scripts/run-help-rehearsal.sh"),
  "utf8",
);

describe("S243 AC-S243-3: the capture script refuses any origin but loopback HTTP", () => {
  it.each([
    "https://pmi-kc-kb-123456789.us-central1.run.app",
    "https://cand-abc123---pmi-kc-kb-123456789.us-central1.run.app",
    "https://pmi-kc-kb.web.app",
    "http://192.168.1.20:3000",
    "http://10.0.0.5:3000",
    "http://localhost.example.com:3000",
    "https://localhost:3000",
    "http://user:secret@localhost:3000",
    "http://localhost:3000/lease-renewal",
    "http://localhost:3000/?next=/admin",
    "not a url",
  ])("refuses %s", (value) => {
    expect(() => requireLoopbackRehearsalOrigin(value)).toThrow(
      /loopback|explicit loopback HTTP origin/,
    );
  });

  it.each([
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:41234/", "http://127.0.0.1:41234"],
    ["http://[::1]:3100", "http://[::1]:3100"],
  ])("accepts %s", (value, origin) => {
    expect(requireLoopbackRehearsalOrigin(value)).toBe(origin);
  });

  it("attach mode always passes its base URL through the loopback guard", () => {
    expect(capture).toMatch(/origin = requireLoopbackRehearsalOrigin\(base\);/);
  });
});

describe("S243 AC-S243-8: the managed rehearsal cannot reach a provider or production store", () => {
  it("managed mode runs only in the disposable worktree against a loopback Firestore emulator", () => {
    expect(capture).toMatch(
      /\/\^\\\/tmp\\\/pmi-kc-help-rehearsal-\[\^\/\]\+\\\/worktree\$\//,
    );
    expect(capture).toMatch(
      /FIRESTORE_EMULATOR_HOST \?\? "", \/\^127\\\.0\\\.0\\\.1:\\d\+\$\//,
    );
    expect(launcher).toMatch(
      /emulators:exec --only firestore --project pmi-kc-kb-help-rehearsal-test/,
    );
  });

  it("the server runs in the Demo descriptor with synthetic credentials and the refusal preload", () => {
    for (const setting of [
      'ENVIRONMENT_KIND: "demo"',
      'DATA_CONTEXT: "demo"',
      'LOCAL_DEMO_AUTH: "true"',
      "`--import=${preload}`",
      'FIREBASE_PROJECT_ID: "pmi-kc-kb-help-rehearsal-test"',
      'GOOGLE_CLOUD_PROJECT: "pmi-kc-kb-help-rehearsal-test"',
      'RENTVINE_API_KEY: "synthetic-help-key"',
      'RENEWAL_SHEET_ID: "synthetic-help-sheet"',
    ])
      expect(capture, setting).toContain(setting);
    expect(capture).toMatch(/tests\/browser\/renewal-novdec-journey-network\.mjs/);
    // The child environment is built from scratch, so no inherited credential reaches the server.
    expect(capture).not.toMatch(/\.\.\.process\.env\b/);
  });

  it("the capture process itself runs under the same refusal preload", () => {
    expect(launcher).toContain(
      '"node --import tsx --import ./tests/browser/renewal-novdec-journey-network.mjs scripts/capture-help-screenshots.mjs --managed$quoted"',
    );
    expect(launcher).toMatch(
      /NOVDEC_JOURNEY_NETWORK_LOG="\$output\/capture-network\.jsonl"/,
    );
  });

  it("refuses a dirty tree unless the overlay is recorded", () => {
    expect(launcher).toMatch(/Commit first, or pass --allow-overlay/);
    expect(launcher).toMatch(/"overlay":%s/);
  });
});
