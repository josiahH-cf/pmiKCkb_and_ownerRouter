// Loader for captured golden sets (R2). The committable synthetic scenarios live in scenarios.ts;
// these come from the live-capture tool (scripts/capture-golden-data.ts) and hold REAL client data, so
// they live in a gitignored, in-boundary dir and are never committed. Only HUMAN-VERIFIED sets
// (labelsVerified:true) are returned — drafts await labeling and must not gate the build. Absent dir →
// [] so the harness stays CI-safe (a fresh checkout has no captured data).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { GoldenScenario } from "@/lib/lease-renewal/golden/harness";

export const DEFAULT_CAPTURED_DIR = "golden-data/captured";

const ExpectedFlagSchema = z.object({
  tab: z.string(),
  sourceRowIndex: z.number(),
  fieldKey: z.string(),
  severity: z.enum(["High", "Blocked", "Medium", "Low"]),
});

const CapturedScenarioSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["correct", "wrong", "edge"]),
  description: z.string(),
  labelsVerified: z.boolean(),
  input: z
    .object({
      runId: z.string(),
      tables: z.array(z.array(z.array(z.string()))),
      nonSheetCandidates: z.array(z.unknown()),
    })
    .passthrough(),
  expectedFlags: z.array(ExpectedFlagSchema),
});

/**
 * Load VERIFIED captured golden scenarios from a gitignored, in-boundary dir. Drafts
 * (labelsVerified:false) are skipped. Returns [] when the dir is absent so callers (the harness gate)
 * stay CI-safe. Throws on a malformed file — a corrupt golden set should fail loudly, not silently.
 */
export function loadVerifiedCapturedScenarios(
  dir: string = DEFAULT_CAPTURED_DIR,
): GoldenScenario[] {
  if (!existsSync(dir)) {
    return [];
  }
  const scenarios: GoldenScenario[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const parsed = CapturedScenarioSchema.parse(
      JSON.parse(readFileSync(join(dir, file), "utf8")),
    );
    if (!parsed.labelsVerified) {
      continue;
    }
    scenarios.push({
      name: parsed.name,
      category: parsed.category,
      description: parsed.description,
      input: parsed.input as unknown as GoldenScenario["input"],
      expectedFlags: parsed.expectedFlags,
    });
  }
  return scenarios;
}
