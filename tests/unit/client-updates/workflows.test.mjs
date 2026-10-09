import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  agenda,
  collectContext,
  contentExample,
  loadSnapshot,
  validateContent,
} from "../../../tools/client-updates/content.mjs";
import {
  loadPreview,
  prepareEmail,
  recordManualSend,
  validateMailConfig,
} from "../../../tools/client-updates/email.mjs";
import {
  acceptPack,
  reviewPack,
  verifyPack,
} from "../../../tools/client-updates/pack.mjs";
import {
  continuity,
  DEFAULTS,
  hash,
  safePath,
  saveJson,
  setBaseline,
  withLock,
} from "../../../tools/client-updates/store.mjs";
import { classifyReleaseChanges } from "../../../scripts/release-watcher-plan.mjs";
const temporary = [];
function storage() {
  const base = mkdtempSync(join(tmpdir(), "pmi-weekly-test-"));
  temporary.push(base);
  return base;
}
const snapshot = {
  id: "a".repeat(64),
  meeting_date: "2026-10-09",
  since: "2026-10-01",
  cutoff: "2026-10-09T12:00:00Z",
  sources: [
    {
      id: "release",
      kind: "release_evidence",
      text: "The lease review was released on October 8. Staff can review the source facts.",
    },
    {
      id: "plan",
      kind: "project_document",
      text: "The future setup is specified and needs the client administrator.",
    },
  ],
};
function content() {
  return {
    ...contentExample(snapshot),
    changes: [
      {
        title: "Lease review",
        detail: "Staff can review the source facts.",
        state: "released",
        evidence: [{ source_id: "release", quote: snapshot.sources[0].text }],
      },
    ],
  };
}
function configure(base) {
  saveJson(join(base, "config.json"), {
    email: {
      sender: "operator@pmikcmetro.com",
      to: [
        { name: "Dan", role: "dan", email: "dan@example.invalid" },
        { name: "Partner", role: "partner", email: "partner@example.invalid" },
      ],
      cc: [],
    },
  });
}
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
describe("evidence and independent continuity", () => {
  it("rejects scaffolds, invented evidence, unsupported release and human observation", () => {
    expect(() => validateContent(contentExample(snapshot), snapshot)).toThrow(
      "empty scaffold",
    );
    for (const edit of [
      (c) => {
        c.changes[0].evidence[0].quote = "Never stated in a real source";
      },
      (c) => {
        c.changes[0].state = "observed";
      },
      (c) => {
        c.changes[0].evidence = [{ source_id: "plan", quote: snapshot.sources[1].text }];
      },
      (c) => {
        c.date = "2026-10-08";
      },
      (c) => {
        c.changes[0].detail = "Contact customer@example.invalid";
      },
    ]) {
      const c = content();
      edit(c);
      expect(() => validateContent(c, snapshot)).toThrow();
    }
  });
  it("requires blocker ownership and dated attributed metrics", () => {
    const c = content();
    c.blockers = [{ ...c.changes[0], state: "pending" }];
    expect(() => validateContent(c, snapshot)).toThrow("owner");
    c.blockers = [];
    c.metrics = [
      {
        ...c.changes[0],
        value: "5",
        measured_at: "2026-10-10",
        type: "actual",
        period: "October",
        scope: "Operations",
      },
    ];
    expect(() => validateContent(c, snapshot)).toThrow("future");
    c.metrics[0].measured_at = "2026-10-08";
    expect(validateContent(c, snapshot)).toBe(c);
  });
  it("scales supported agendas to their exact duration", () => {
    for (let minutes = 30; minutes <= 180; minutes++)
      expect(agenda(minutes).reduce((a, b) => a + b, 0)).toBe(minutes);
  });
  it("reads committed main over dirty proposals and rejects snapshot tampering", () => {
    const base = storage(),
      repo = join(base, "repo");
    mkdirSync(repo);
    const git = (...args) =>
      execFileSync("git", args, { cwd: repo, stdio: "pipe", encoding: "utf8" }).trim();
    git("init", "-b", "main");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "Local fixture");
    git(
      "remote",
      "add",
      "origin",
      "https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter.git",
    );
    for (const file of DEFAULTS.source_paths) {
      mkdirSync(dirname(join(repo, file)), { recursive: true });
      writeFileSync(join(repo, file), "Committed source facts.");
    }
    git("add", ".");
    git("commit", "-m", "Local fixture");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    writeFileSync(join(repo, "docs/facts.md"), "Invented uncommitted release.");
    setBaseline(base, "email", { cutoff: "2026-10-08T12:00:00Z" });
    const collected = collectContext(base, { root: repo, refresh: false, lane: "pack" }),
      result = loadSnapshot(base, collected.snapshot_id);
    expect(result.sources[0].text).toBe("Committed source facts.");
    expect(result.dirty_checkout).toBe(true);
    expect(result.coverage.gmail).toBe("not_checked");
    expect(result.previous).toBe(null);
    result.sources[0].text = "tampered";
    saveJson(collected.path, result);
    expect(() => loadSnapshot(base, result.id)).toThrow("integrity");
  });
  it("keeps meeting, pack and sent-email baselines independent", () => {
    const base = storage();
    setBaseline(base, "email", { cutoff: "one" });
    setBaseline(base, "pack", { cutoff: "two" });
    setBaseline(base, "meeting", { date: "three" });
    expect(continuity(base)).toEqual({
      email: { cutoff: "one" },
      pack: { cutoff: "two" },
      meeting: { date: "three" },
    });
  });
});
describe("copy-ready email without provider effects", () => {
  it("produces real line breaks and emojis, without marking text as sent", () => {
    const base = storage();
    configure(base);
    const result = prepareEmail(base, content(), snapshot);
    expect(result.mode).toBe("copy_only");
    expect(result.message.body).toContain("Hi Dan and Partner,");
    for (const icon of ["😊", "✅", "🔜", "🚧"])
      expect(result.message.body).toContain(icon);
    expect(result.message.body).toContain("\n\n");
    expect(result.message.body).not.toContain("<li>");
    expect(continuity(base).email).toBeUndefined();
    expect(prepareEmail(base, content(), snapshot).preview_id).toBe(result.preview_id);
  });
  it("requires exact real recipient configuration and prevents duplicate recipients", () => {
    expect(() => validateMailConfig({})).toThrow();
    const base = storage();
    configure(base);
    const config = JSON.parse(readFileSync(join(base, "config.json"), "utf8")).email;
    config.to[1].email = config.to[0].email;
    expect(() => validateMailConfig(config)).toThrow("exactly once");
  });
  it("rejects edited previews and labels manual send reports honestly", () => {
    const base = storage();
    configure(base);
    const result = prepareEmail(base, content(), snapshot);
    expect(() => recordManualSend(base, result.preview_id, "wrong")).toThrow(
      "exact preview",
    );
    expect(
      recordManualSend(base, result.preview_id, result.preview_id).verification,
    ).toBe("owner_reported");
    const preview = JSON.parse(readFileSync(result.path, "utf8"));
    preview.message.body = "changed";
    saveJson(result.path, preview);
    expect(() => loadPreview(base, result.preview_id)).toThrow("integrity");
  });
});
describe("pack integrity and runner boundary", () => {
  it("requires every page reviewed and rejects files changed after review", () => {
    const base = storage(),
      run = "b".repeat(64),
      dir = join(base, "packs", run);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "deck.pdf"), "fixture");
    const manifest = {
      run,
      cutoff: snapshot.cutoff,
      files: { "deck.pdf": hash("fixture") },
      pages: ["deck-01.png", "agenda-01.png"],
    };
    manifest.manifest_hash = hash(manifest);
    saveJson(join(dir, "manifest.json"), manifest);
    expect(() => acceptPack(base, run)).toThrow();
    expect(() => reviewPack(base, run, ["deck-01.png"], true, true)).toThrow("every");
    reviewPack(base, run, manifest.pages, true, true);
    acceptPack(base, run);
    expect(continuity(base).email).toBeUndefined();
    writeFileSync(join(dir, "deck.pdf"), "altered");
    expect(() => verifyPack(base, run)).toThrow("changed");
  });
  it("refuses path traversal and concurrent local claims", () => {
    const base = storage();
    expect(() => safePath(base, "../private")).toThrow("escapes");
    withLock(base, "pack", () =>
      expect(() => withLock(base, "pack", () => {})).toThrow("locked"),
    );
  });
  it("excludes only named local workflows from application releases", () => {
    expect(
      classifyReleaseChanges([
        "tools/client-updates/cli.mjs",
        ".agents/skills/weekly-call/SKILL.md",
        ".gcloudignore",
      ]),
    ).toBe(false);
    expect(classifyReleaseChanges(["tools/other-runtime.mjs"])).toBe(true);
    expect(classifyReleaseChanges([".agents/skills/unrelated/SKILL.md"])).toBe(true);
    expect(classifyReleaseChanges(["tools/client-updates/cli.mjs", "app/page.tsx"])).toBe(
      true,
    );
  });
});
