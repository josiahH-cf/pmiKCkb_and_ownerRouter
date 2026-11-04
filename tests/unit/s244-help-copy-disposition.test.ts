import { describe, expect, it } from "vitest";

import { HELP_COPY_DISPOSITIONS } from "@/lib/help/copy-disposition";
import { SECTION_HELP, SECTION_HELP_IDS } from "@/lib/lease-renewal/section-help";
import { HELP_STALE_STATEMENTS } from "@/scripts/check-help-content.mjs";
import { inventoryHelpCopy } from "@/scripts/lib/help-copy-inventory.mjs";

// S244 ARCH-S244-1 / AC-S244-1: every renewal About panel, InfoTip, in-scope inline helper sentence
// and Process guide entry has a disposition row; a help text in source without a row fails naming
// it, a row naming text the source no longer has fails, and corrected or removed text stays gone.

const inventory = inventoryHelpCopy();
const key = (entry: { kind: string; location: string; text: string }) =>
  `${entry.kind}|${entry.location}|${entry.text}`;

function sectionHelpText(id: string) {
  const help = SECTION_HELP[id as keyof typeof SECTION_HELP];
  return [
    help.label,
    help.purpose,
    ...(help.steps ?? []),
    help.saves,
    help.notDone,
    help.next?.label ?? "",
  ].join("\n");
}

const allHelpCopy = [
  ...SECTION_HELP_IDS.map(sectionHelpText),
  ...inventory.map((item) => item.text),
].join("\n");

describe("S244 help copy disposition table", () => {
  it("inventories the four InfoTips, every Process guide entry and the in-scope inline sentences", () => {
    expect(
      inventory
        .filter((item) => item.kind === "infotip")
        .map((item) => item.text.split(" | ")[0]),
    ).toEqual(
      expect.arrayContaining([
        "Approve availability",
        "Deny availability",
        "Publication checks",
        "{label.text}",
      ]),
    );
    expect(
      inventory.filter((item) => item.kind === "process-guide").length,
    ).toBeGreaterThanOrEqual(30);
    expect(inventory.filter((item) => item.kind === "inline").length).toBeGreaterThan(
      200,
    );
  });

  it("AC-S244-1: every help text in source has a row with a disposition", () => {
    const rows = new Set(
      HELP_COPY_DISPOSITIONS.filter(
        (row) => row.kind !== "about" && row.disposition !== "remove",
      ).map(key),
    );
    const missing = inventory.filter((item) => !rows.has(key(item)));
    expect(missing.map((item) => `${item.location}: ${item.text}`)).toEqual([]);
  });

  it("no kept or corrected row names text the source no longer renders", () => {
    const live = new Set(inventory.map(key));
    const stale = HELP_COPY_DISPOSITIONS.filter(
      (row) =>
        row.kind !== "about" && row.disposition !== "remove" && !live.has(key(row)),
    );
    expect(stale.map((row) => `${row.location}: ${row.text}`)).toEqual([]);
  });

  it("every row records what it describes and a known disposition; corrections cite a delivered rule", () => {
    for (const row of HELP_COPY_DISPOSITIONS) {
      expect(row.describes.trim().length, `${row.location}: ${row.text}`).toBeGreaterThan(
        3,
      );
      expect(["keep", "correct", "remove"]).toContain(row.disposition);
      if (row.disposition !== "keep") {
        expect(row.contradicts?.length, `${row.location}: ${row.text}`).toBeGreaterThan(
          0,
        );
        for (const suite of row.contradicts ?? []) expect(suite).toMatch(/^S\d+$/);
      }
    }
  });

  it("every About id has exactly one row, and each correction is applied and stays applied", () => {
    const about = HELP_COPY_DISPOSITIONS.filter((row) => row.kind === "about");
    expect(about.map((row) => row.aboutId).sort()).toEqual([...SECTION_HELP_IDS].sort());
    for (const row of about) {
      expect(row.text).toBe(
        SECTION_HELP[row.aboutId as keyof typeof SECTION_HELP].purpose,
      );
      for (const correction of row.corrections ?? []) {
        expect(sectionHelpText(row.aboutId!)).toContain(correction.after);
        expect(allHelpCopy, `${row.aboutId}: ${correction.before}`).not.toContain(
          correction.before,
        );
      }
    }
  });

  it("corrected and removed inline text never comes back", () => {
    for (const row of HELP_COPY_DISPOSITIONS.filter((entry) => entry.kind !== "about")) {
      if (row.disposition === "remove") expect(allHelpCopy).not.toContain(row.text);
      for (const correction of row.corrections ?? []) {
        expect(allHelpCopy, `${row.location}: ${correction.before}`).not.toContain(
          correction.before,
        );
      }
    }
  });
});

describe("S244 BEH-S244-1 / AC-S244-2: superseded statements are gone", () => {
  it("the document handoff help names ordinary staff confirmation, not an Admin approval reason", () => {
    const handoff = sectionHelpText("document-handoff");
    expect(handoff).not.toMatch(/Admin approval reason|lets an Admin confirm/);
    expect(handoff).toMatch(
      /renewal staff member with edit access confirms each supported packet action/,
    );
    expect(handoff).toMatch(/enter a confirmation reason and confirm it once/);
    expect(handoff).toMatch(/Signatures are collected in Dotloop by hand/);
  });

  it("the working terms help no longer says the packet does not read them", () => {
    const terms = sectionHelpText("working-terms");
    expect(terms).not.toMatch(/does not read them yet/);
    expect(terms).toMatch(
      /the document packet reads the Working terms the recorded owner approval covers/,
    );
  });

  it("no help copy contains a superseded statement", () => {
    for (const statement of [
      "Admin approval reason",
      "approval note",
      "Dan approves",
      "does not read them yet",
      ...HELP_STALE_STATEMENTS,
    ])
      expect(allHelpCopy.toLowerCase(), statement).not.toContain(statement.toLowerCase());
  });
});
