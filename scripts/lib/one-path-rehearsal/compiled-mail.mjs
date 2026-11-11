import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const CONFIG = "next.config.ts";
const ADAPTER = "tests/browser/fixtures/s260-compiled-mail.ts";
const SOURCE_PREVIEW = "tests/browser/fixtures/s260-compiled-source-preview.ts";
// S271: the governed Gmail draft resolves its stand-in from the shared rehearsal module, which
// answers null in every production build. In the isolated compile that specifier resolves to this
// fixture, which answers only under the same compiled synthetic-mail fence as the adapter.
const DRAFT_STAND_IN = "tests/browser/fixtures/s271-compiled-stand-in.ts";
const WORKER = "tests/browser/fixtures/s260-compiled-mail-worker.ts";
const ROUTE = "app/api/rehearsal/s260-mail-worker/route.ts";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const S260_DRIVER = "tests/browser/one-path-november-9-qualification-driver.mjs";
export const S271_DRIVER = "tests/browser/one-path-november-10-qualification-driver.mjs";
/** The exact drivers the compiled synthetic mail admits, and no other file. */
export const COMPILED_MAIL_DRIVERS = Object.freeze([S260_DRIVER, S271_DRIVER]);
const DISPOSABLE_WORKTREE = /^\/tmp\/pmi-kc-one-path-rehearsal-[^/]+\/worktree$/;

/**
 * Whether one rehearsal may build the compiled synthetic mail: a disposable worktree, a compiled
 * build with the mail adapter, no overlay, no named commit, the harness of the served commit and
 * exactly one of the admitted drivers. Pure, so the fence can be tested without a rehearsal.
 */
export function compiledMailAdmits({
  cwd,
  driver,
  compiled,
  mailAdapter,
  overlay,
  namedCommit,
  servedSha,
  harnessSha,
}) {
  return (
    DISPOSABLE_WORKTREE.test(String(cwd)) &&
    compiled === true &&
    mailAdapter === true &&
    overlay === false &&
    namedCommit === false &&
    /^[a-f0-9]{40}$/.test(String(servedSha)) &&
    servedSha === harnessSha &&
    COMPILED_MAIL_DRIVERS.some((name) => driver === cwd + "/" + name)
  );
}

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
  assert.ok(
    compiledMailAdmits({
      cwd: process.cwd(),
      driver,
      compiled,
      mailAdapter,
      overlay,
      namedCommit,
      servedSha,
      harnessSha,
    }),
    "Compiled synthetic mail admits only the exact S260 or S271 driver on a clean compiled commit.",
  );
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
      '    "@/lib/environment/rehearsal-stand-in": "./' + DRAFT_STAND_IN + '",',
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
      draftStandIn: sha256(readFileSync(DRAFT_STAND_IN)),
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
