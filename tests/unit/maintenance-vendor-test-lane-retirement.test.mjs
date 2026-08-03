import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const RETIRED_RUNTIME_PATHS = [
  "app/api/admin/vendors/test/[vendorId]/audit/route.ts",
  "app/api/admin/vendors/test/route.ts",
  "app/api/maintenance/tickets/[ticketId]/test-actions/route.ts",
  "app/api/maintenance/tickets/[ticketId]/vendor-handoff/route.ts",
  "app/api/maintenance/tickets/test-seed/route.ts",
  "app/api/vendor/tickets/[ticketId]/test-mailbox/route.ts",
  "components/admin/VendorAdminPanel.tsx",
  "components/vendor/VendorTestMailboxPanel.tsx",
  "lib/maintenance/test-workflow.ts",
  "lib/vendor/admin-runtime.ts",
  "lib/vendor/test-identity.ts",
  "lib/vendor/test-mailbox.ts",
];

const RETIRED_RUNTIME_REFERENCES = [
  "/api/admin/vendors/test",
  "/api/maintenance/tickets/test-seed",
  "/test-actions",
  "/vendor-handoff",
  "/test-mailbox",
  "@/components/admin/VendorAdminPanel",
  "@/components/vendor/VendorTestMailboxPanel",
  "@/lib/maintenance/test-workflow",
  "@/lib/vendor/admin-runtime",
  "@/lib/vendor/test-identity",
  "@/lib/vendor/test-mailbox",
];

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function runtimeSources() {
  return ["app", "components", "lib"].flatMap((root) =>
    walk(path.join(ROOT, root)).map((absolute) => ({
      relative: path.relative(ROOT, absolute).split(path.sep).join("/"),
      source: fs.readFileSync(absolute, "utf8"),
    })),
  );
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [absolute] : [];
  });
}

const RUNTIME_SOURCE_FILES = runtimeSources();

describe("S56 Maintenance and Vendor Test-lane retirement", () => {
  it("removes every shipped Test intake, action, identity, mailbox, and admin module", () => {
    expect(
      RETIRED_RUNTIME_PATHS.filter((relative) =>
        fs.existsSync(path.join(ROOT, relative)),
      ),
    ).toEqual([]);
  });

  it("leaves no production import or route reference to the retired machinery", () => {
    const matches = RUNTIME_SOURCE_FILES.flatMap(({ relative, source }) =>
      RETIRED_RUNTIME_REFERENCES.filter((reference) => source.includes(reference)).map(
        (reference) => `${relative}: ${reference}`,
      ),
    );
    expect(matches).toEqual([]);
  });

  it("keeps creation structurally Live-only and refuses legacy non-Live records", () => {
    const tickets = read("lib/firestore/maintenance-tickets.ts");
    const intakeToken = read("lib/maintenance/intake-token.ts");
    const intakeWriter = read("lib/firestore/maintenance-unverified-intake.ts");
    const vendorAuth = read("lib/vendor/auth.ts");

    expect(tickets).toContain('data_mode: z.literal("live").default("live")');
    expect(tickets).toContain('ticket.data_mode !== "live"');
    expect(intakeToken).toContain('input.dataMode !== "live"');
    expect(intakeWriter).toContain('submission.dataMode !== "live"');
    expect(vendorAuth).toContain('dataMode !== "live"');
    expect([tickets, intakeToken, intakeWriter, vendorAuth].join("\n")).not.toContain(
      "NODE_ENV",
    );
  });

  it("retains data_mode decoding while keeping deterministic rehearsal helpers test-only", () => {
    expect(read("lib/maintenance/ticket-model.ts")).toContain("data_mode: DataMode");
    expect(read("lib/vendor/model.ts")).toContain("data_mode?: DataMode");
    expect(
      fs.existsSync(path.join(ROOT, "tests/helpers/maintenance-test-workflow.ts")),
    ).toBe(true);
    expect(
      RUNTIME_SOURCE_FILES.some(({ relative }) => relative.includes("test-workflow")),
    ).toBe(false);
  });
});
