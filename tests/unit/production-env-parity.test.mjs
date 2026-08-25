import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Production env parity gate.
//
// The deploy wrapper reads `.env.production.local` (DEFAULT_PRODUCTION_ENV_FILE) and ships its values
// as a REPLACING env map (`--set-env-vars`), so anything missing from that file is CLEARED on the
// running service rather than left alone.
//
// On 2026-08-25 that file carried ONE knowledge Space where `.env.local` carried eleven, so ten
// Spaces were silently unconfigured in production. Nothing caught it: check-live-cost asserts "at
// least one" Space when --allow-multiple-spaces is passed, and the production cutover preflight
// asserts "at least one" plus cross-map consistency. Both pass on a one-Space file.
//
// This gate compares the two files structurally. It never reads a secret value: it parses only the
// Space maps (infrastructure ids) and otherwise compares KEY NAMES.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PROD = join(root, ".env.production.local");
const DEV = join(root, ".env.local");

const SPACE_MAPS = ["SPACE_DRIVE_FOLDER_IDS", "SPACE_VERTEX_DATA_STORE_IDS"];

/**
 * Runtime names the app reads that MUST reach the deployed service. Each is read from process.env at
 * runtime and has a silent failure mode when absent: the feature binds to a default or reports
 * not-configured with no error naming the deploy wrapper as the cause.
 */
const MUST_FORWARD = ["RENTCAST_MONTHLY_ALLOWANCE"];

function parseEnv(path) {
  if (!existsSync(path)) return null;
  const out = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out.set(m[1], m[2].trim().replace(/^["']|["']$/g, ""));
  }
  return out;
}

function spaceKeys(env, name) {
  const raw = env?.get(name);
  if (!raw) return null;
  try {
    return Object.keys(JSON.parse(raw));
  } catch {
    return null;
  }
}

const prod = parseEnv(PROD);
const dev = parseEnv(DEV);

// Both files are gitignored working-tree files; skip rather than fail in a clean checkout or CI.
const bothPresent = prod !== null && dev !== null;
const describeLocal = bothPresent ? describe : describe.skip;

describeLocal("production env parity (local working tree only)", () => {
  for (const name of SPACE_MAPS) {
    it(`${name}: production carries every Space the dev map declares`, () => {
      const devKeys = spaceKeys(dev, name);
      const prodKeys = spaceKeys(prod, name);
      expect(devKeys, `${name} is missing or unparsable in .env.local`).toBeTruthy();
      expect(
        prodKeys,
        `${name} is missing or unparsable in .env.production.local`,
      ).toBeTruthy();

      const missing = devKeys.filter((k) => !prodKeys.includes(k));
      expect(
        missing,
        `.env.production.local ${name} is missing ${missing.length} Space(s): ${missing.join(", ")}. The deploy ships this file as a REPLACING map, so those Spaces would be unconfigured in production.`,
      ).toEqual([]);
    });
  }

  it("both Space maps describe the same Space set", () => {
    const [a, b] = SPACE_MAPS.map((n) => spaceKeys(prod, n));
    expect([...a].sort()).toEqual([...b].sort());
  });

  it("forwards every runtime name with a silent-default failure mode", () => {
    const wrapper = readFileSync(
      join(root, "scripts", "deploy-demo-cloud-run.mjs"),
      "utf8",
    );
    const unforwarded = MUST_FORWARD.filter((name) => !wrapper.includes(name));
    expect(
      unforwarded,
      `These names are read at runtime but never forwarded by the deploy wrapper, so the deployed service silently uses a default: ${unforwarded.join(", ")}`,
    ).toEqual([]);
  });
});
