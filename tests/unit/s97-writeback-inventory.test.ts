import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACTION_REGISTRY_SEED,
  OWNER_PROOF_WINDOW_OPEN_KEYS,
} from "@/lib/integrations/action-registry-seed";
import { FINAL_V1_ACTION_PREVIEW_SCHEMAS } from "@/lib/integrations/final-v1-action-contracts";
import { LEASE_EXECUTION_ACTIONS } from "@/lib/lease-renewal/execution/matrix";
import {
  RENEWAL_WRITEBACK_KEYS,
  RETIRED_BROAD_WRITEBACK_KEY,
} from "@/lib/lease-renewal/writeback/proposal-contract";

// S97 ARCH-S97-2 / AC-S97-6: the retired broad key and the synthetic composite execution shape are
// unreachable in production code, while the three exact keys own the field matrix everywhere.

const ROOT = process.cwd();
const PRODUCTION_DIRS = ["app", "components", "lib", "scripts"] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// One cached full read: /mnt-style mounts make per-test tree scans time out.
let cachedTexts: ReadonlyMap<string, string> | null = null;
function productionTexts(): ReadonlyMap<string, string> {
  if (!cachedTexts) {
    cachedTexts = new Map(
      PRODUCTION_DIRS.flatMap((dir) => walk(join(ROOT, dir))).map(
        (file) => [file, readFileSync(file, "utf8")] as const,
      ),
    );
  }
  return cachedTexts;
}

function offendersContaining(
  predicate: (text: string, file: string) => boolean,
): string[] {
  return [...productionTexts()]
    .filter(([file, text]) => predicate(text, file))
    .map(([file]) => file);
}

const SCAN_TIMEOUT = 120_000;

describe("S97 retired-machinery inventory", () => {
  it(
    "keeps the synthetic composite executor out of the entire production tree",
    { timeout: SCAN_TIMEOUT },
    () => {
      expect(
        offendersContaining(
          (text) =>
            text.includes("RentvineRenewalExecutor") ||
            text.includes("compareAndSetRenewal"),
        ),
      ).toEqual([]);
    },
  );

  it(
    "keeps the old composite preview shape dead everywhere in production code",
    { timeout: SCAN_TIMEOUT },
    () => {
      // The five-field composite signature; fee_cents alone identifies it.
      expect(offendersContaining((text) => text.includes("fee_cents"))).toEqual([]);
      expect(
        FINAL_V1_ACTION_PREVIEW_SCHEMAS[RETIRED_BROAD_WRITEBACK_KEY as never],
      ).toBeUndefined();
    },
  );

  it(
    "keeps the retired broad key out of every production execution surface",
    { timeout: SCAN_TIMEOUT },
    () => {
      // The registry retains the retired identifier as a closed compatibility entry…
      const retired = ACTION_REGISTRY_SEED.find(
        (entry) => entry.key === RETIRED_BROAD_WRITEBACK_KEY,
      );
      expect(retired?.production_allowed).toBe(false);
      // …but no execution matrix, preview schema, or writeback contract names it.
      expect(LEASE_EXECUTION_ACTIONS).not.toContain(RETIRED_BROAD_WRITEBACK_KEY);
      const allowed = [
        // These name it only as the retired, non-executable compatibility identifier:
        "action-registry-seed.ts", // registry row (closed)
        "risk-policy.ts", // historical risk floor
        "proposal-contract.ts", // the retirement constant itself
        "renewal-discrepancy-dispositions.ts", // historical-disposition vocabulary
        "rentvine-proof-contract.ts", // preserved S30 proof-era constant (gates now refuse it)
      ];
      expect(
        offendersContaining(
          (text, file) =>
            !allowed.some((name) => file.endsWith(name)) &&
            text.includes(RETIRED_BROAD_WRITEBACK_KEY),
        ),
      ).toEqual([]);
    },
  );

  it(
    "registers all three exact keys as proven system-of-record writes with the matrix",
    { timeout: SCAN_TIMEOUT },
    () => {
      for (const key of RENEWAL_WRITEBACK_KEYS) {
        const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === key);
        expect(entry, key).toBeDefined();
        // S97 activation 2026-09-02: every key passed its own bounded live proof before opening.
        expect(entry?.production_allowed, key).toBe(true);
        expect(LEASE_EXECUTION_ACTIONS).toContain(key);
        expect(
          FINAL_V1_ACTION_PREVIEW_SCHEMAS[
            key as keyof typeof FINAL_V1_ACTION_PREVIEW_SCHEMAS
          ],
          key,
        ).toBeDefined();
      }
    },
  );

  it(
    "keeps the S30 proof CLI reachable as a safety primitive but not as the product route",
    { timeout: SCAN_TIMEOUT },
    () => {
      const proofCli = productionTexts().get(
        join(ROOT, "scripts", "prove-rentvine-renewal-write.ts"),
      );
      expect(proofCli).toContain("RentVineProofService");
      const componentsDir = join(ROOT, "components");
      expect(
        offendersContaining(
          (text, file) =>
            file.startsWith(componentsDir) && text.includes("RentVineProofService"),
        ),
      ).toEqual([]);
    },
  );
});
