import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULTS = JSON.parse(
  readFileSync(join(ROOT, "tools/client-updates/config.json"), "utf8"),
);
export const hash = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value),
    )
    .digest("hex");
export const normalize = (value) => String(value).replace(/\s+/g, " ").trim();
export function fail(message) {
  throw new Error(message);
}
export function assert(condition, message) {
  if (!condition) fail(message);
}
export function id(value) {
  assert(/^[a-f0-9]{64}$/.test(value ?? ""), "Invalid run or preview ID");
  return value;
}
export function git(args, cwd = ROOT, trim = true) {
  // Windows-created worktrees contain Windows gitdir pointers. Use their owning Git in WSL.
  const pointer = join(cwd, ".git");
  const windowsWorktree =
    process.platform !== "win32" &&
    existsSync(pointer) &&
    lstatSync(pointer).isFile() &&
    /^gitdir: [A-Za-z]:/m.test(readFileSync(pointer, "utf8"));
  const binary = windowsWorktree ? "/mnt/c/Program Files/Git/cmd/git.exe" : "git";
  const argv = windowsWorktree
    ? [
        "-C",
        cwd.replace(/^\/mnt\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:/`),
        ...args,
      ]
    : args;
  const output = execFileSync(binary, argv, {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return trim ? output.trim() : output;
}
export function stateRoot(root = ROOT) {
  // All worktrees and both Windows/WSL sessions share the main checkout's ignored output.
  const raw = git(["rev-parse", "--git-common-dir"], root);
  const portable =
    process.platform === "win32"
      ? raw
      : raw
          .replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/mnt/${drive.toLowerCase()}/`)
          .replaceAll("\\", "/");
  const common = resolve(root, portable);
  return resolve(dirname(realpathSync(common)), "output/client-updates");
}
export function safePath(base, ...parts) {
  const target = resolve(base, ...parts);
  const rel = relative(resolve(base), target);
  assert(
    rel && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`),
    "Path escapes private workflow storage",
  );
  let cursor = resolve(base);
  // Check every existing ancestor, including the configured storage root.
  for (const segment of ["", ...rel.split(sep)]) {
    if (segment) cursor = join(cursor, segment);
    if (existsSync(cursor))
      assert(!lstatSync(cursor).isSymbolicLink(), "Symlink in workflow storage");
  }
  // An ancestor above base must not redirect this private tree either.
  for (
    let parent = dirname(resolve(base));
    parent !== dirname(parent);
    parent = dirname(parent)
  ) {
    if (existsSync(parent))
      assert(!lstatSync(parent).isSymbolicLink(), "Symlink above workflow storage");
  }
  return target;
}
export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
export function saveJson(path, value, exclusive = false) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = exclusive ? path : `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (!exclusive) renameSync(temporary, path);
}
export function withLock(base, key, work) {
  const lock = safePath(base, "locks", `${key}.lock`);
  mkdirSync(dirname(lock), { recursive: true, mode: 0o700 });
  try {
    mkdirSync(lock);
  } catch {
    fail("Workflow locked; reconcile the existing run before retrying");
  }
  try {
    return work();
  } finally {
    rmdirSync(lock);
  }
}
export function localDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULTS.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function date(value) {
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") &&
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value,
    "Invalid date",
  );
  return value;
}
export function privateConfig(base) {
  const path = safePath(base, "config.json");
  return existsSync(path) ? readJson(path) : {};
}
export function rendererConfig(base) {
  const config = privateConfig(base);
  return config.renderers?.[process.platform === "win32" ? "windows" : "linux"] ?? config;
}
export function readPrivate(base, path) {
  return readJson(safePath(base, relative(base, resolve(path))));
}
export function continuity(base) {
  const path = safePath(base, "continuity.json");
  return existsSync(path) ? readJson(path) : {};
}
export function setBaseline(base, lane, value) {
  return withLock(base, "continuity", () =>
    saveJson(safePath(base, "continuity.json"), { ...continuity(base), [lane]: value }),
  );
}
