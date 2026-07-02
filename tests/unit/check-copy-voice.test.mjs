import { describe, expect, it } from "vitest";

import { scanCopyText, collectViolations } from "../../scripts/check-copy-voice.mjs";

describe("scanCopyText", () => {
  it("flags forbidden jargon on rendered lines", () => {
    const { jargon } = scanCopyText('const s = "the exception and control plane";');
    expect(jargon).toHaveLength(1);
    expect(jargon[0].term).toBe("control plane");
  });

  it("catches every rejected jargon phrase", () => {
    const { jargon } = scanCopyText(
      [
        'subtitle="PMI handles the setup for you"',
        'powers: "read-authoritative source of truth"',
      ].join("\n"),
    );
    expect(jargon.map((j) => j.term).sort()).toEqual(["PMI handles", "source of truth"]);
  });

  it("does NOT flag jargon inside a // line comment or a real /* */ block", () => {
    const lineComment = scanCopyText(
      "const x = 1; // Admin-only approval control (Phase-2 control plane).",
    );
    expect(lineComment.jargon).toHaveLength(0);
    const blockComment = scanCopyText(
      "/**\n * Phase-2 control plane — the single source of truth.\n */\nconst y = 2;",
    );
    expect(blockComment.jargon).toHaveLength(0);
  });

  it("DOES flag jargon on a bare '*'-leading line outside a block comment (finding-4 fix)", () => {
    const { jargon } = scanCopyText("const s = `* the control plane`;");
    expect(jargon.map((j) => j.term)).toContain("control plane");
  });

  it("keeps the // skip from eating a URL scheme", () => {
    const { jargon } = scanCopyText('const u = "https://x.example/control plane/ok";');
    expect(jargon.map((j) => j.term)).toContain("control plane");
  });

  it("flags an em dash but not an en dash", () => {
    const emDash = scanCopyText("subject: `Renewal coming up — home`;");
    expect(emDash.emDashes).toHaveLength(1);
    const enDash = scanCopyText("value: `$1,500–$1,700`;");
    expect(enDash.emDashes).toHaveLength(0);
  });

  it("allowlists the verbatim draft banner em dash", () => {
    const banner = scanCopyText(
      'export const DRAFT_BANNER = "Draft — Review before sending";',
    );
    expect(banner.emDashes).toHaveLength(0);
  });
});

describe("collectViolations (repo scan)", () => {
  it("passes the hard gate: no jargon anywhere and no em dashes in client-facing drafts", () => {
    const { errors } = collectViolations();
    expect(errors).toEqual([]);
  });
});
