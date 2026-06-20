import { describe, expect, it } from "vitest";
import { ingestTables } from "@/lib/lease-renewal/ingest";
import {
  RENEWALS_HEADER,
  SYNTHETIC_CREDENTIAL_TAB_4,
  SYNTHETIC_CREDENTIAL_TAB_7,
  SYNTHETIC_RENEWALS_6COL_FRAGMENT,
  SYNTHETIC_RENEWALS_TAB,
} from "../fixtures/lease-renewal/synthetic-renewal-sheet";

const [, RENEWAL_ROW_1, RENEWAL_ROW_2, RENEWAL_ROW_3] = SYNTHETIC_RENEWALS_TAB.grid;

describe("ingestTables", () => {
  it("ingests a recognized tab into typed records with a counts-only summary", () => {
    const { records, manifest, excludedTabs } = ingestTables([
      [...SYNTHETIC_RENEWALS_TAB.grid],
    ]);

    expect(manifest.tabsRecognized).toBe(1);
    expect(excludedTabs).toHaveLength(0);
    expect(records).toHaveLength(3);

    const renewals = manifest.perTab[0];
    expect(renewals).toMatchObject({
      tab: "Renewals",
      tabNumber: 3,
      dataRowCount: 3,
      recordCount: 3,
      murkyColumnCount: 0,
      mismatchCount: 0,
      status: "ok",
    });
    // Records carry typed, normalized fields.
    expect(records[0].fields.renewal_date).toMatchObject({
      type: "date",
      value: "2026-08-31",
    });
    expect(records[0].fields.current_rent).toMatchObject({
      type: "currency",
      value: 1250,
    });
  });

  it("re-stitches a headerless fractured fragment onto the preceding tab by width", () => {
    const headerPlusTwo = [RENEWALS_HEADER, RENEWAL_ROW_1, RENEWAL_ROW_2];
    const continuation = [RENEWAL_ROW_3];

    const { records, manifest } = ingestTables([headerPlusTwo, continuation]);

    expect(manifest.tabsRecognized).toBe(1);
    expect(manifest.tabsUnrecognized).toBe(0);
    expect(records).toHaveLength(3);
    expect(manifest.perTab[0].recordCount).toBe(3);
  });

  it("drops divider rows and does NOT merge a mismatched-width fragment", () => {
    const { manifest } = ingestTables([
      [...SYNTHETIC_RENEWALS_TAB.grid],
      [...SYNTHETIC_RENEWALS_6COL_FRAGMENT.grid],
    ]);

    // The 6-col fragment has two `-----` rows and one `.` row.
    expect(manifest.dividerRowsDropped).toBeGreaterThanOrEqual(3);
    expect(manifest.tabsRecognized).toBe(1);
    expect(manifest.tabsUnrecognized).toBe(1);
    expect(manifest.unrecognizedRowCount).toBe(3);
  });

  it("hard-excludes credential tabs and never emits their cells", () => {
    const result = ingestTables([
      [...SYNTHETIC_CREDENTIAL_TAB_4.grid],
      [...SYNTHETIC_CREDENTIAL_TAB_7.grid],
    ]);

    expect(result.records).toHaveLength(0);
    expect(result.manifest.credentialTabsExcluded).toBe(2);
    expect(result.excludedTabs.map((t) => t.tabNumber).sort()).toEqual([4, 7]);

    // The emit scrubber guarantee: no excluded cell value survives anywhere in the output.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("PLACEHOLDER");
    expect(serialized).not.toContain("BIRCHWOOD-GUEST");
  });

  it("guards against credential tables that fingerprinting failed to recognize", () => {
    const result = ingestTables([
      [
        ["Account", "Login Username", "Login Password"],
        ["acme", "synthetic-user", "PW-PLACEHOLDER"],
      ],
    ]);

    expect(result.records).toHaveLength(0);
    expect(result.manifest.credentialTabsExcluded).toBe(1);
    expect(JSON.stringify(result)).not.toContain("PLACEHOLDER");
  });

  it("marks a tab Blocked when a row is wider than the header (cannot align)", () => {
    const raggedRow = [...RENEWAL_ROW_1, "EXTRA COLUMN VALUE"];
    const { manifest } = ingestTables([[RENEWALS_HEADER, RENEWAL_ROW_1, raggedRow]]);

    const renewals = manifest.perTab[0];
    expect(renewals.status).toBe("blocked");
    expect(renewals.blockedReason).toMatch(/more columns than the header/);
    expect(renewals.recordCount).toBe(1);
    expect(renewals.dataRowCount).toBe(2);
    // Row-conservation holds: records + ragged == data rows.
    expect(renewals.recordCount + 1).toBe(renewals.dataRowCount);
  });

  it("keeps the manifest counts-only — no actual data-row cell value appears", () => {
    const { manifest } = ingestTables([[...SYNTHETIC_RENEWALS_TAB.grid]]);
    const serialized = JSON.stringify(manifest);

    // Assert against every distinctive data-row cell value the fixture actually contains,
    // not three hand-picked literals.
    const dataCells = SYNTHETIC_RENEWALS_TAB.grid
      .slice(1)
      .flat()
      .map((cell) => cell.trim())
      .filter((cell) => cell.length >= 4 && !/^(yes|n\/a)$/i.test(cell));
    expect(dataCells.length).toBeGreaterThan(5);
    for (const value of dataCells) {
      expect(serialized, value).not.toContain(value);
    }
  });

  it("scrubs a credential value that slips past the boundary into a recognized tab (§2.2.5)", () => {
    // A credential value pasted into a deep data row (index 3, beyond the Stage-B 3-row header scan)
    // of a recognized, non-credential tab. It must be redacted at emit, not emitted.
    const leakRow = [...RENEWAL_ROW_3];
    leakRow[7] = "Wifi Password leaked-secret";
    const { records, manifest } = ingestTables([
      [RENEWALS_HEADER, RENEWAL_ROW_1, RENEWAL_ROW_2, leakRow],
    ]);

    expect(manifest.credentialScrubHits).toBe(1);
    const renewals = manifest.perTab[0];
    expect(renewals.status).toBe("blocked");
    expect(renewals.blockedReason).toMatch(/scrubbed at emit/);

    // The row is still emitted, but the offending field is redacted — original value is gone.
    const leaked = records.find(
      (r) => r.fields.tenant_responded?.value === "[REDACTED-CREDENTIAL]",
    );
    expect(leaked).toBeDefined();
    expect(JSON.stringify({ records, manifest })).not.toContain("leaked-secret");
  });

  it("excludes a drifted credential table via the spec token set even when fingerprinting fails", () => {
    // Headers drift so the fingerprint is sub-threshold (UNRECOGNIZED), but the authoritative
    // content guard still catches passcode / access code.
    const result = ingestTables([
      [
        ["Platform", "Login", "Passcode", "Access Code"],
        ["ttlock", "user-x", "PASSCODE-PLACEHOLDER", "CODE-PLACEHOLDER"],
      ],
    ]);

    expect(result.records).toHaveLength(0);
    expect(result.manifest.credentialTabsExcluded).toBe(1);
    expect(JSON.stringify(result)).not.toContain("PLACEHOLDER");
  });

  it("preserves row-conservation on every non-blocked tab", () => {
    const { manifest } = ingestTables([[...SYNTHETIC_RENEWALS_TAB.grid]]);
    for (const tab of manifest.perTab) {
      if (tab.status === "ok") {
        expect(tab.recordCount).toBe(tab.dataRowCount);
      }
    }
  });
});
