import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RENEWAL_WRITEBACK_SERVICE_MESSAGES } from "@/lib/lease-renewal/writeback/execution-service";

// S237 R-S237-3: every RentVine write-back refusal, decline, ambiguity and reconciliation result
// reaches the page as one plain message; the internal code text never does.

describe("S237 RentVine outcome messages", () => {
  it("gives every service code a plain message naming what was not sent again", () => {
    for (const [code, message] of Object.entries(RENEWAL_WRITEBACK_SERVICE_MESSAGES)) {
      expect(message, code).toMatch(/RentVine/);
      expect(message, code).not.toMatch(/S97|_|\(\w+\)/);
      expect(message, code).toMatch(/sent nothing new|changed nothing|not be sent again/);
    }
  });

  it("returns the plain message from the route instead of the internal code text", () => {
    const route = readFileSync(
      join(
        process.cwd(),
        "app",
        "api",
        "lease-renewal",
        "rentvine-writeback",
        "route.ts",
      ),
      "utf8",
    );
    // Contract errors already carry their own plain message; only service codes are mapped.
    expect(route).toMatch(/error: RENEWAL_WRITEBACK_SERVICE_MESSAGES\[error\.code\]/);
  });
});

describe("S237 R-S237-6 one scope statement beside the updates", () => {
  it("names what confirmed updates change, what stays manual and what is unsupported, once", () => {
    const workspace = readFileSync(
      join(process.cwd(), "components", "lease-renewal", "RenewalWorkspace.tsx"),
      "utf8",
    );
    expect(workspace.match(/<SourceUpdateScope \/>/g)).toHaveLength(1);
    expect(workspace).toMatch(
      /\{rentvineUpdatesPanel \|\| sheetProposalPanel \? <SourceUpdateScope \/> : null\}\s*\{rentvineUpdatesPanel\}\s*\{sheetProposalPanel\}/,
    );
    const statement = workspace
      .slice(workspace.indexOf("export function SourceUpdateScope"))
      .replace(/\s+/g, " ");
    for (const phrase of [
      "lease dates and recurring charges in RentVine",
      "recognized renewal fields on the Sheet",
      "One-time fees, deposits, ledger history, party changes",
      "Sheet reversals stay manual",
      "no general RentVine base-rent",
      "no combined RentVine-and-Sheet update and no Sheet row deletion",
    ])
      expect(statement).toContain(phrase);
  });
});
