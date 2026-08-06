import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const HANDOFF_PATH = join(root, "docs", "environment-handoff.md");
const CLIENT_CHECKLIST_PATH = join(root, "docs", "client-checklist.md");

const REQUIRED_PROVIDERS = [
  "RentVine",
  "RentCast",
  "Gmail",
  "Vendor Gmail",
  "Google Sheets",
  "Dotloop",
  "LeadSimple",
  "QuickBooks",
  "Boom/SMS",
  "Drive",
];

const PRIMARY_SOURCE_URLS = {
  gmail: "https://developers.google.com/workspace/gmail/api/reference/quota",
  sheets: "https://developers.google.com/workspace/sheets/api/limits",
  drive: "https://developers.google.com/workspace/drive/api/guides/limits",
  rentcastTerms: "https://www.rentcast.io/terms-api",
  rentcastBilling: "https://developers.rentcast.io/reference/billing-and-pricing",
};

function readSection(path, heading) {
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(heading);

  if (start === -1) {
    throw new Error(`${path} is missing ${heading}`);
  }

  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n##\s+/);
  return end === -1 ? rest : rest.slice(0, end);
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  const cells = [];
  let cell = "";
  let inCode = false;
  let escaped = false;

  for (let index = 1; index < trimmed.length; index += 1) {
    const character = trimmed[index];

    if (escaped) {
      cell += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      cell += character;
      escaped = true;
      continue;
    }

    if (character === "`") {
      inCode = !inCode;
      cell += character;
      continue;
    }

    if (character === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }

    cell += character;
  }

  if (cell.trim() !== "") {
    cells.push(cell.trim());
  }

  return cells;
}

function readTable(section, requiredHeader) {
  const lines = section.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    if (!line.trim().startsWith("|")) return false;
    return splitMarkdownRow(line).includes(requiredHeader);
  });

  if (headerIndex === -1) {
    throw new Error(`section is missing a table with header ${requiredHeader}`);
  }

  const headers = splitMarkdownRow(lines[headerIndex]);
  const rows = [];

  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith("|")) break;
    rows.push(splitMarkdownRow(line));
  }

  return { headers, rows };
}

describe("S52 provider quota and terms registry", () => {
  const handoffSection = readSection(HANDOFF_PATH, "## Provider activation registry");
  const handoffTable = readTable(handoffSection, "System");
  const quotaIndex = handoffTable.headers.indexOf("Documented quota / terms");
  const providerRows = new Map(handoffTable.rows.map((row) => [row[0], row]));

  it("keeps one nonblank quota/terms cell for every provider row", () => {
    const providerNames = handoffTable.rows.map((row) => row[0]);

    expect(quotaIndex).toBeGreaterThanOrEqual(0);
    expect(providerNames).toEqual(expect.arrayContaining(REQUIRED_PROVIDERS));
    expect(new Set(providerNames).size, "provider names must be unique").toBe(
      providerNames.length,
    );

    for (const [provider, row] of providerRows) {
      expect(row, `${provider} row must match the header width`).toHaveLength(
        handoffTable.headers.length,
      );

      const quotaTerms = row[quotaIndex];
      expect(quotaTerms, `${provider} quota/terms cell must not be blank`).toBeTruthy();

      const hasPrimarySource = Object.values(PRIMARY_SOURCE_URLS).some((url) =>
        quotaTerms.includes(url),
      );
      if (!hasPrimarySource) {
        expect(quotaTerms, `${provider} must use the exact unresolved marker`).toBe(
          "Needs Verification",
        );
      }
    }
  });

  it("pins primary sources without treating published defaults as account proof", () => {
    const gmail = providerRows.get("Gmail")[quotaIndex];
    const vendorGmail = providerRows.get("Vendor Gmail")[quotaIndex];
    const sheets = providerRows.get("Google Sheets")[quotaIndex];
    const drive = providerRows.get("Drive")[quotaIndex];

    expect(gmail).toContain(PRIMARY_SOURCE_URLS.gmail);
    expect(gmail).toContain("pre-May-2026");
    expect(gmail).toContain("Needs Verification");
    expect(vendorGmail).toContain(PRIMARY_SOURCE_URLS.gmail);
    expect(vendorGmail).toContain("Needs Verification");
    expect(sheets).toContain(PRIMARY_SOURCE_URLS.sheets);
    expect(sheets).toContain("Needs Verification");
    expect(drive).toContain(PRIMARY_SOURCE_URLS.drive);
    expect(drive).toContain("pre-May-2026");
    expect(drive).toContain("Needs Verification");
  });

  // S59 (2026-08-06): `Q-RENTCAST-PLAN-TERMS`'s legal half is RESOLVED from the published API
  // Terms (caching/storage/owner-facing display expressly permitted), so the pin now enforces the
  // resolved wording — while STILL requiring the row to keep the action account-gated: an active
  // API subscription (the 403 finding) and the real allowance/overage readback (AC-S59-14).
  it("records the resolved RentCast terms while keeping the action account-gated", () => {
    const rentcast = providerRows.get("RentCast")[quotaIndex];
    const normalized = rentcast.toLowerCase();

    expect(rentcast).toContain(PRIMARY_SOURCE_URLS.rentcastTerms);
    expect(rentcast).toContain("RESOLVED 2026-08-06");
    expect(normalized).toContain("caching");
    expect(normalized).toContain("displaying");
    expect(normalized).toContain("active api subscription");
    expect(rentcast).toContain("Q-RENTCAST-ACCOUNT-403");
    expect(rentcast).toContain("AC-S59-14");
    expect(rentcast).toContain("hard quota stop");
  });

  it("routes the exact RentCast confirmation and safe default to the client checklist", () => {
    const checklistSection = readSection(
      CLIENT_CHECKLIST_PATH,
      "## Provider activation requests",
    );
    const checklistTable = readTable(checklistSection, "Provider");
    const rentcast = checklistTable.rows.find((row) => row[0] === "RentCast");

    expect(rentcast).toBeDefined();
    expect(rentcast).toHaveLength(checklistTable.headers.length);

    const request = rentcast[1].toLowerCase();
    expect(request).toContain("active api plan");
    expect(request).toContain("monthly allowance/overage");
    expect(request).toContain("active api subscription");
    expect(request).toContain("q-rentcast-account-403");
    expect(rentcast[2].toLowerCase()).toContain("gate flip before a working smoke");

    expect(checklistSection).toContain(PRIMARY_SOURCE_URLS.rentcastTerms);
    expect(checklistSection).toContain("Q-RENTCAST-PLAN-TERMS");
    expect(checklistSection).toContain("the RentCast action stays gated");
    expect(checklistSection).toContain("manual comp entry continues");
  });
});
