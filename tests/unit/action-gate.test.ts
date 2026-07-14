import { describe, expect, it } from "vitest";

import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import {
  ActionNotExecutableError,
  assertActionExecutable,
  isActionExecutable,
} from "@/lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

const GMAIL_KEY = "gmail.draft.create";
const GATED_KEY = "google_sheets.renewal_checklist.writeback"; // documented capability, still Planned/false

function seedEntry(key: string): CreateActionRegistryInput {
  const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`seed entry ${key} missing`);
  return entry;
}

describe("action-gate", () => {
  it("executes the allow-listed workflow reply-draft transport", () => {
    expect(isActionExecutable(GMAIL_KEY)).toBe(true);
    expect(() => assertActionExecutable(GMAIL_KEY)).not.toThrow();
  });

  it("keeps sample-backed renewal draft initiation gated", () => {
    expect(isActionExecutable("gmail.renewal_notice.draft_create")).toBe(false);
  });

  it("still refuses a gated entry with no runtime (Planned/false)", () => {
    expect(isActionExecutable(GATED_KEY)).toBe(false);
    expect(() => assertActionExecutable(GATED_KEY)).toThrow(ActionNotExecutableError);
  });

  it("returns false for an unknown key (never throws on lookup)", () => {
    expect(isActionExecutable("does.not.exist")).toBe(false);
  });

  it("opens the gate ONLY for an Approved+Documented entry, via the test seam (seed untouched)", () => {
    const flipped: CreateActionRegistryInput[] = [
      {
        ...seedEntry(GATED_KEY),
        readiness: "Approved for Execution",
        evidence_status: "Documented",
        documented_evidence:
          "Committed DWD grant artifact (SA client id + authorized scopes).",
        production_allowed: true,
      },
    ];
    expect(isActionExecutable(GATED_KEY, flipped)).toBe(true);
    // The real committed seed is unchanged — this still-gated key's default path stays closed.
    expect(isActionExecutable(GATED_KEY)).toBe(false);
  });

  it("cannot be opened by flipping production_allowed alone (schema enforces Approved+Documented)", () => {
    const sneaky: CreateActionRegistryInput[] = [
      { ...seedEntry(GATED_KEY), production_allowed: true }, // readiness stays "Planned"
    ];
    expect(() => isActionExecutable(GATED_KEY, sneaky)).toThrow();
  });
});
