import { spawnSync } from "node:child_process";

// S151: run the Dashboard history browser smoke against the automated harness. Start it inside a
// Firestore emulator so every history write stays local, for example:
//   firebase emulators:exec --only firestore --project pmi-kc-kb-e2e \
//     --config firebase.e2e.json "node scripts/run-dashboard-history-browser-smoke.mjs"
// It seeds the safe demo records, starts `next dev` with the harness settings (demo accounts,
// deterministic interpretation, Live-read-only), runs scripts/smoke-dashboard-history-browser.mjs
// and stops the server. It refuses to run without an emulator.

if (!process.env.FIRESTORE_EMULATOR_HOST?.trim()) {
  throw new Error(
    "Run this smoke inside `firebase emulators:exec`; it needs a local emulator.",
  );
}
process.env.E2E_PORT ??= "4320";
const { default: setup } = await import("../tests/e2e/global-setup.mjs");
const teardown = await setup({ provide: () => undefined });
let status = 1;
try {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/smoke-dashboard-history-browser.mjs",
      `--base-url=http://localhost:${process.env.E2E_PORT}/`,
    ],
    { stdio: "inherit", timeout: 15 * 60_000, killSignal: "SIGKILL" },
  );
  status = result.status ?? 1;
} finally {
  await teardown();
}
process.exit(status);
