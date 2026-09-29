import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readSheetWritebackRuntimeBinding,
  sheetRuntimeBindingMatches,
} from "@/lib/lease-renewal/sheet-writeback/runtime-binding";

afterEach(() => vi.unstubAllEnvs());
describe("S128 immutable runtime binding", () => {
  it.each([undefined, "", "../revision", "pmi rev"])(
    "refuses missing or malformed runtime identity %s",
    (revision) => {
      vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
      vi.stubEnv("K_REVISION", revision);
      expect(readSheetWritebackRuntimeBinding()).toBeNull();
    },
  );
  it("binds exact enabled identity and refuses old/forged/missing bindings after resume", () => {
    vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
    vi.stubEnv("K_REVISION", "pmi-kc-app-enabled-a");
    const old = readSheetWritebackRuntimeBinding()!;
    expect(sheetRuntimeBindingMatches(old)).toBe(true);
    expect(sheetRuntimeBindingMatches({ ...old, extra: "forged" })).toBe(false);
    expect(sheetRuntimeBindingMatches(undefined)).toBe(false);
    vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "false");
    expect(readSheetWritebackRuntimeBinding()).toBeNull();
    vi.stubEnv("K_REVISION", "pmi-kc-app-resumed-b");
    vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
    expect(sheetRuntimeBindingMatches(old)).toBe(false);
  });
});
