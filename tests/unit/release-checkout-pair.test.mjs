import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { it, expect, afterEach } from "vitest";
import { selectReleaseCheckoutPair } from "../../scripts/release-checkout-pair.mjs";
const fixtures = [];
function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pmi-kc-release-pair-test-"));
  fixtures.push(root);
  const nativeAnchor = join(root, "native", "main"),
    sourceAnchor = join(root, "windows", "authoring"),
    stateRoot = join(root, "state");
  for (const dir of [nativeAnchor, sourceAnchor, stateRoot])
    mkdirSync(dir, { recursive: true });
  for (const dir of [nativeAnchor, sourceAnchor]) {
    git(dir, ["init"]);
    git(dir, [
      "remote",
      "add",
      "origin",
      "https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter.git",
    ]);
    writeFileSync(join(dir, "fixture.txt"), "Local only");
    git(dir, ["add", "fixture.txt"]);
    git(dir, [
      "-c",
      "user.name=Local fixture",
      "-c",
      "user.email=fixture@pmikcmetro.com",
      "commit",
      "-qm",
      "Local only",
    ]);
  }
  const nativeRoot = join(root, "native", "release"),
    sourceRoot = join(root, "windows", ".pmi-kc-release-worktrees", "release");
  mkdirSync(join(root, "windows", ".pmi-kc-release-worktrees"));
  git(nativeAnchor, ["worktree", "add", "--detach", nativeRoot, "HEAD"]);
  git(sourceAnchor, ["worktree", "add", "--detach", sourceRoot, "HEAD"]);
  const input = { stateRoot, nativeAnchor, sourceAnchor, callerRoot: nativeRoot };
  const pair = {
    schemaVersion: 1,
    repository: "josiahH-cf/pmiKCkb_and_ownerRouter",
    nativeRoot,
    sourceRoot,
  };
  const save = (value = pair) =>
    writeFileSync(join(stateRoot, "checkout-pair.json"), JSON.stringify(value));
  return { root, input, pair, save };
}
afterEach(() => {
  for (const root of fixtures.splice(0)) {
    const rel = relative(tmpdir(), root);
    if (
      isAbsolute(rel) ||
      rel.startsWith("..") ||
      !rel.startsWith("pmi-kc-release-pair-test-")
    )
      throw Error("Unsafe fixture cleanup");
    rmSync(root, { recursive: true, force: true });
  }
});
it("retains the original paired-checkout contract when no isolated pair is selected", () => {
  const f = fixture();
  expect(selectReleaseCheckoutPair(f.input)).toEqual({
    valid: true,
    mode: "existing",
    nativeRoot: f.input.nativeAnchor,
    sourceRoot: f.input.sourceAnchor,
  });
});
it("accepts only registered worktrees of both approved local repositories without modifying authoring work", () => {
  const f = fixture();
  writeFileSync(join(f.input.sourceAnchor, "fixture.txt"), "Unrelated work stays");
  f.save();
  expect(selectReleaseCheckoutPair(f.input)).toEqual({
    valid: true,
    mode: "registered_pair",
    nativeRoot: f.pair.nativeRoot,
    sourceRoot: f.pair.sourceRoot,
  });
  expect(git(f.input.sourceAnchor, ["status", "--porcelain"])).toContain("fixture.txt");
});
it("refuses unknown options, substituted origins and escaped roots", () => {
  const f = fixture();
  for (const invalid of [
    { ...f.pair, extra: true },
    { ...f.pair, repository: "other/repo" },
    { ...f.pair, nativeRoot: f.input.sourceAnchor },
    { ...f.pair, sourceRoot: f.input.sourceAnchor },
  ]) {
    f.save(invalid);
    expect(selectReleaseCheckoutPair(f.input).valid).toBe(false);
  }
  f.save();
  git(f.input.sourceAnchor, [
    "remote",
    "set-url",
    "origin",
    "https://github.com/other/repo.git",
  ]);
  expect(selectReleaseCheckoutPair(f.input).valid).toBe(false);
});
it("never substitutes a malformed selection with a permissive default", () => {
  const f = fixture();
  writeFileSync(join(f.input.stateRoot, "checkout-pair.json"), "{");
  expect(selectReleaseCheckoutPair(f.input)).toEqual({
    valid: false,
    mode: "invalid",
    nativeRoot: null,
    sourceRoot: null,
  });
});

it("rejects a same-commit same-origin clone that does not share the approved repository registration", () => {
  const f = fixture(),
    clone = join(f.root, "native", "unregistered-clone");
  execFileSync("git", ["clone", "--no-local", f.input.nativeAnchor, clone], {
    stdio: "ignore",
  });
  git(clone, [
    "remote",
    "set-url",
    "origin",
    "https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter.git",
  ]);
  f.save({ ...f.pair, nativeRoot: clone });
  expect(selectReleaseCheckoutPair(f.input).valid).toBe(false);
  f.save();
  expect(selectReleaseCheckoutPair({ ...f.input, callerRoot: clone }).valid).toBe(false);
});
it("resolves a linked path before checking its allowed checkout root", () => {
  const f = fixture(),
    outside = join(f.root, "outside-source"),
    link = join(f.root, "windows", ".pmi-kc-release-worktrees", "escaped");
  git(f.input.sourceAnchor, ["worktree", "add", "--detach", outside, "HEAD"]);
  symlinkSync(outside, link, "dir");
  f.save({ ...f.pair, sourceRoot: link });
  expect(selectReleaseCheckoutPair(f.input).valid).toBe(false);
});
