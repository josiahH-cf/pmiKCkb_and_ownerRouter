import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const CONFIG = "next.config.ts";
const ADAPTER = "tests/browser/fixtures/s260-compiled-mail.ts";
const SOURCE_PREVIEW = "tests/browser/fixtures/s260-compiled-source-preview.ts";
const WORKER = "tests/browser/fixtures/s260-compiled-mail-worker.ts";
const ROUTE = "app/api/rehearsal/s260-mail-worker/route.ts";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const S260_DRIVER = "tests/browser/one-path-november-9-qualification-driver.mjs";

export function setupCompiledMail({
  clockFile,
  driver,
  compiled,
  mailAdapter,
  overlay,
  namedCommit,
  servedSha,
  harnessSha,
}) {
  assert.match(process.cwd(), /^\/tmp\/pmi-kc-one-path-rehearsal-[^/]+\/worktree$/);
  assert.ok(
    compiled && mailAdapter && !overlay && !namedCommit && servedSha === harnessSha,
  );
  assert.equal(driver, process.cwd() + "/" + S260_DRIVER);
  const original = readFileSync(CONFIG, "utf8");
  assert.match(original, /export default nextConfig;\s*$/);
  const synthetic = original.replace(
    /export default nextConfig;\s*$/,
    [
      "export default {",
      "  ...nextConfig,",
      "  turbopack: { ...nextConfig.turbopack, resolveAlias: {",
      "    ...nextConfig.turbopack?.resolveAlias,",
      '    "@/lib/gmail-hub/rehearsal-mail": "./' + ADAPTER + '",',
      '    "@/lib/lease-renewal/writeback/live": "./' + SOURCE_PREVIEW + '",',
      "  } },",
      "};",
      "",
    ].join("\n"),
  );
  const worker = readFileSync(WORKER);
  const token = randomBytes(32).toString("hex");
  writeFileSync(clockFile, "null\n", { mode: 0o600, flag: "wx" });
  return {
    token,
    now: () => JSON.parse(readFileSync(clockFile, "utf8")) ?? Date.now(),
    identity: {
      adapter: sha256(readFileSync(ADAPTER)),
      worker: sha256(worker),
      sourcePreview: sha256(readFileSync(SOURCE_PREVIEW)),
      nextConfig: sha256(original),
      isolatedNextConfig: sha256(synthetic),
    },
    environment: {
      S260_SYNTHETIC_WORKER_TOKEN: token,
      S260_SYNTHETIC_MAIL_CLOCK: clockFile,
    },
    async build(run) {
      // The compiled output contains the alias and route. Restore the exact
      // checked-out inputs before start so they never escape the test compiler.
      mkdirSync(dirname(ROUTE), { recursive: true });
      writeFileSync(ROUTE, worker, { flag: "wx" });
      try {
        writeFileSync(CONFIG, synthetic);
        await run();
      } finally {
        writeFileSync(CONFIG, original);
        rmSync(ROUTE);
      }
    },
  };
}
