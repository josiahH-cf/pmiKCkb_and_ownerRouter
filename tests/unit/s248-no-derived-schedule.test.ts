import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S248 R-S248-12 / L43, the static half (the behavioral half is in
// tests/firestore/s248-outreach-records.test.ts): the evidence model, the stage projection, the
// outreach record store and the send hook derive no reminder, deadline, follow-up or schedule.
// None of them imports a reminder, follow-up or scheduling module, and none writes a due time or a
// schedule. The send hook only records an accepted send, after it settled.

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const DERIVING_MODULES = [
  "lib/lease-renewal/outreach-evidence.ts",
  "lib/lease-renewal/renewal-stage.ts",
  "lib/lease-renewal/renewal-stage-context.ts",
  "lib/lease-renewal/renewal-path.ts",
  "lib/firestore/renewal-outreach-records.ts",
  "lib/production-assurance/outreach-evidence-projection.ts",
];

const FORBIDDEN_IMPORTS = [
  /from "@\/lib\/lease-renewal\/notice-reminders"/,
  /from "@\/lib\/firestore\/lease-renewal-follow-up/,
  /from "@\/lib\/gmail-hub\/sequence-worker"/,
  /from "@\/lib\/gmail-hub\/schedule-calendar"/,
  /from "@\/lib\/work-accountability/,
  /from "@\/lib\/integrations\/action-gate"/,
];

// Each is an object key (after a brace or a comma), never a read inside an expression.
const FORBIDDEN_WRITES = [
  /[{,]\s*nextDueAtMs\s*:/,
  /[{,]\s*schedule\s*:\s*\{/,
  /[{,]\s*reminder[A-Za-z]*\s*:/i,
  /[{,]\s*followUp[A-Za-z]*\s*:\s*\{/,
  /[{,]\s*deadline[A-Za-z]*\s*:/i,
  /\.collection\(\s*["'`][^"'`]*(reminder|follow_up|deadline|schedule)/i,
];

describe("S248 R-S248-12: the app's evidence derives no reminder, deadline, follow-up or schedule", () => {
  for (const path of DERIVING_MODULES)
    it(`${path} imports and writes none`, () => {
      const source = read(path);
      for (const pattern of FORBIDDEN_IMPORTS) expect(source).not.toMatch(pattern);
      for (const pattern of FORBIDDEN_WRITES) expect(source).not.toMatch(pattern);
    });

  it("the send hook records an accepted send after it settled, and changes nothing about the send", () => {
    const service = read("lib/gmail-hub/sequence-service.ts");
    const hook = service.slice(service.indexOf("private async recordAccepted("));
    const body = hook.slice(0, hook.indexOf("\n  }\n") + 4);
    expect(body).toContain("recordAcceptedSend");
    expect(body).not.toMatch(/store\.(write|settle|claim|observe)/);
    expect(body).not.toMatch(/nextDueAtMs|schedule/);
    // A failure is swallowed: it never repeats or fails the send.
    expect(body).toMatch(/catch \{/);
  });
});
