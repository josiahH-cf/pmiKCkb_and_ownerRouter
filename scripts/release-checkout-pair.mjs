// S183/S226: preserve unrelated authoring work by selecting two registered, clean release
// worktrees. This changes no exact-main, CI, environment, lock, permit or assurance gate.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, dirname, relative } from "node:path";
const REPOSITORY = "josiahH-cf/pmiKCkb_and_ownerRouter";
function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 30000,
  }).trim();
}
function within(root, path) {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
function approvedOrigin(root) {
  return /^(?:https:\/\/github\.com\/|git@github\.com:)(josiahH-cf\/pmiKCkb_and_ownerRouter)(?:\.git)?$/.test(
    git(root, ["remote", "get-url", "origin"]),
  );
}
function common(root) {
  const value = git(root, ["rev-parse", "--git-common-dir"]);
  return realpathSync(isAbsolute(value) ? value : join(root, value));
}
function registered(anchor, target) {
  return (
    git(anchor, ["worktree", "list", "--porcelain"])
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .some((line) => {
        try {
          return realpathSync(line.slice(9)) === target;
        } catch {
          return false;
        }
      }) &&
    common(anchor) === common(target) &&
    approvedOrigin(anchor) &&
    approvedOrigin(target)
  );
}
export function selectReleaseCheckoutPair({
  stateRoot,
  nativeAnchor,
  sourceAnchor,
  callerRoot,
}) {
  const file = join(stateRoot, "checkout-pair.json");
  if (!existsSync(file))
    return {
      valid: true,
      mode: "existing",
      nativeRoot: nativeAnchor,
      sourceRoot: sourceAnchor,
    };
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (
      !data ||
      data.schemaVersion !== 1 ||
      data.repository !== REPOSITORY ||
      Object.keys(data).sort().join(",") !==
        "nativeRoot,repository,schemaVersion,sourceRoot"
    )
      throw Error();
    if (!isAbsolute(data.nativeRoot) || !isAbsolute(data.sourceRoot)) throw Error();
    const nativeRoot = realpathSync(data.nativeRoot),
      sourceRoot = realpathSync(data.sourceRoot);
    if (
      nativeRoot === sourceRoot ||
      !within(dirname(nativeAnchor), nativeRoot) ||
      !within(join(dirname(sourceAnchor), ".pmi-kc-release-worktrees"), sourceRoot)
    )
      throw Error();
    if (
      !registered(nativeAnchor, nativeRoot) ||
      !registered(sourceAnchor, sourceRoot) ||
      !registered(nativeAnchor, realpathSync(callerRoot))
    )
      throw Error();
    return { valid: true, mode: "registered_pair", nativeRoot, sourceRoot };
  } catch {
    return { valid: false, mode: "invalid", nativeRoot: null, sourceRoot: null };
  }
}
