// The Cloud Run source upload, computed the way gcloud computes it, and the files Cloud Build's
// production type check would need from outside it.
//
// The matcher is a Node port of the Cloud SDK's gcloudignore FileChooser
// (googlecloudsdk/command_lib/util/gcloudignore.py and glob.py, SDK 592). Patterns apply in order
// and the last match wins for each path prefix. A path under an ignored directory can't be
// re-included. Only the .gcloudignore's own `#!include:` lines are honoured, not those inside an
// included file. Unlike Git, a pattern with a middle slash is not anchored to the root: only a
// leading slash anchors, so `docs/specs/` also matches `a/docs/specs/`.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import ts from "typescript";

const INCLUDE_DIRECTIVE = "!include:";
// Python's str.splitlines() boundaries.
const LINE_BREAKS = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/;
const ODD_TRAILING_BACKSLASHES = /(?<!\\)\\(\\\\)*$/;

// posixpath.split: the head keeps no trailing slash unless it is only slashes.
function split(path) {
  const cut = path.lastIndexOf("/") + 1;
  let head = path.slice(0, cut);
  if (head && !/^\/+$/.test(head)) head = head.replace(/\/+$/, "");
  return [head, path.slice(cut)];
}

function normpath(path) {
  const normal = posix.normalize(path);
  return normal.length > 1 ? normal.replace(/\/+$/, "") : normal;
}

// glob.GetPathPrefixes: "a/b/c" gives ["", "a", "a/b", "a/b/c"].
function pathPrefixes(path) {
  const prefixes = [path];
  let tail = "x";
  while (path && tail) {
    [path, tail] = split(path);
    prefixes.unshift(path);
  }
  return prefixes;
}

// fnmatch.translate for one path component; Linux fnmatch is case-sensitive.
const compiled = new Map();
function fnmatch(name, pattern) {
  let regex = compiled.get(pattern);
  if (!regex) {
    let source = "",
      star = false;
    for (let i = 0; i < pattern.length; ) {
      const c = pattern[i++];
      if (c === "*") {
        if (!star) source += "[\\s\\S]*";
        star = true;
        continue;
      }
      star = false;
      if (c === "?") source += "[\\s\\S]";
      else if (c === "[") {
        let j = i;
        if (j < pattern.length && pattern[j] === "!") j++;
        if (j < pattern.length && pattern[j] === "]") j++;
        while (j < pattern.length && pattern[j] !== "]") j++;
        if (j >= pattern.length) source += "\\[";
        else {
          let set = pattern.slice(i, j).replaceAll("\\", "\\\\");
          i = j + 1;
          if (!set) source += "(?!)";
          else if (set === "!") source += "[\\s\\S]";
          else {
            if (set[0] === "!") set = `^${set.slice(1)}`;
            else if (set[0] === "^" || set[0] === "[") set = `\\${set}`;
            source += `[${set.replace(/^(\^?)\]/, "$1\\]")}]`;
          }
        }
      } else source += c.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
    }
    regex = new RegExp(`^(?:${source})$`);
    compiled.set(pattern, regex);
  }
  return regex.test(name);
}

// glob.Glob._MatchesHelper: pattern parts match the path from its last component backwards.
function matchesParts(parts, path) {
  if (!parts.length) return true;
  if (path === null) return false;
  const part = parts[parts.length - 1];
  let remaining = parts.slice(0, -1);
  if (path) path = normpath(path);
  let [remainingPath, pathPart] = split(path);
  if (!pathPart) remainingPath = null;
  if (part === "**") {
    if (!(remaining.length && remaining[0] === "")) remaining = ["", ...remaining];
    return pathPrefixes(path).some((prefix) => matchesParts(remaining, prefix));
  }
  if (part === "*" && !remaining.length && remainingPath && remainingPath.length > 1)
    return false;
  if (!fnmatch(pathPart, part)) return false;
  return matchesParts(remaining, remainingPath);
}

// gcloudignore.Pattern.FromString and glob.Glob.FromString; null for a line gcloud skips.
function parsePattern(line) {
  if (line.startsWith("#")) return null;
  const negated = line.startsWith("!");
  if (negated) line = line.slice(1);
  const mustBeDir = line.endsWith("/");
  if (mustBeDir) line = line.slice(0, -1);
  const tokens = [];
  for (let i = 0; i < line.length; ) {
    if (line[i] === "\\" && i + 1 < line.length) {
      tokens.push(line.slice(i, i + 2));
      i += 2;
    } else tokens.push(line[i++]);
  }
  while (tokens.length && tokens[tokens.length - 1] === " ") tokens.pop();
  line = tokens.join("").replaceAll("\\ ", " ");
  if (ODD_TRAILING_BACKSLASHES.test(line)) return null;
  line = line.replace(/\\([^\\])/g, "$1").replaceAll("\\\\", "\\");
  if (!line) return null;
  return { negated, mustBeDir, parts: line.split("/") };
}

function parseIgnoreFile(file, recurse) {
  if (!existsSync(file)) throw new Error(`upload_ignore_file_unreadable: ${file}`);
  const patterns = [];
  for (const line of readFileSync(file, "utf8").split(LINE_BREAKS)) {
    if (line.startsWith("#")) {
      if (line.slice(1).trimStart().startsWith(INCLUDE_DIRECTIVE)) {
        const included = line.slice(
          line.indexOf(INCLUDE_DIRECTIVE) + INCLUDE_DIRECTIVE.length,
        );
        if (included.includes("/"))
          throw new Error("upload_ignore_include_outside_directory");
        if (recurse)
          patterns.push(...parseIgnoreFile(join(dirname(file), included), recurse - 1));
      }
      continue;
    }
    const pattern = parsePattern(line);
    if (pattern) patterns.push(pattern);
  }
  return patterns;
}

/** The ordered patterns of `<root>/.gcloudignore`, with its `#!include:` files expanded once. */
export function readUploadIgnore(root) {
  return parseIgnoreFile(join(root, ".gcloudignore"), 1);
}

/** gcloudignore.FileChooser.IsIncluded for a root-relative POSIX path. */
export function isUploaded(patterns, path, isDir = false) {
  for (const prefix of pathPrefixes(path).slice(1)) {
    const prefixIsDir = prefix !== path || isDir;
    let match = null;
    for (const pattern of patterns) {
      if (pattern.mustBeDir && !prefixIsDir) continue;
      if (matchesParts(pattern.parts, prefix))
        match = pattern.negated ? "include" : "ignore";
    }
    if (match === "ignore") return false;
  }
  return true;
}

/** Every tracked file: a release uploads a clean checkout, so untracked files never reach it. */
export function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

/** The tracked files `gcloud run deploy --source` would upload from a clean checkout. */
export function uploadSet(root, files = trackedFiles(root)) {
  const patterns = readUploadIgnore(root);
  return files.filter((file) => isUploaded(patterns, file));
}

const SCANNED = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/**
 * Cloud Build runs `next build` on the upload alone, so it type-checks the tsconfig files that
 * are uploaded and needs everything they reach. Returns the imports and references from those
 * files (and from the code they reach) to files `.gcloudignore` leaves out, and the left-out
 * type-checked files that declare globals or augment modules, which uploaded files could rely on.
 */
export function findUploadOnlyFailures(root, { files = trackedFiles(root) } = {}) {
  root = resolve(root);
  const patterns = readUploadIgnore(root);
  const uploaded = (file) => isUploaded(patterns, file);
  const toRelative = (abs) => relative(root, abs).split(sep).join("/");
  const tracked = new Set(files);
  const config = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
  if (config.error) throw new Error("upload_tsconfig_unreadable");
  const { options, fileNames } = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    root,
  );
  const typeChecked = fileNames.map(toRelative).filter((file) => tracked.has(file));
  const roots = typeChecked.filter(uploaded);
  const cache = ts.createModuleResolutionCache(root, (name) => name, options);
  const excludedImports = [];
  const seen = new Set(roots);
  const queue = [...roots];
  const check = (from, specifier, target) => {
    const file = toRelative(target);
    if (file.startsWith("../") || file.split("/").includes("node_modules")) return;
    if (!uploaded(file)) excludedImports.push({ from, specifier, to: file });
    else if (SCANNED.test(file) && tracked.has(file) && !seen.has(file)) {
      seen.add(file);
      queue.push(file);
    }
  };
  // An asset or untyped import TypeScript leaves unresolved still has to be in the upload.
  const literalTarget = (specifier, from) => {
    const bare = specifier.split(/[?#]/)[0];
    const candidate =
      bare.startsWith("./") || bare.startsWith("../")
        ? resolve(dirname(from), bare)
        : bare.startsWith("@/")
          ? resolve(root, bare.slice(2))
          : null;
    return candidate && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : null;
  };
  while (queue.length) {
    const file = queue.shift();
    const abs = join(root, file);
    const info = ts.preProcessFile(readFileSync(abs, "utf8"), true, true);
    for (const { fileName: specifier } of info.importedFiles) {
      const resolved = ts.resolveModuleName(
        specifier,
        abs,
        options,
        ts.sys,
        cache,
      ).resolvedModule;
      if (resolved?.isExternalLibraryImport) continue;
      const target = resolved?.resolvedFileName ?? literalTarget(specifier, abs);
      if (target) check(file, specifier, target);
    }
    for (const { fileName: reference } of info.referencedFiles) {
      const target = resolve(dirname(abs), reference);
      if (existsSync(target)) check(file, reference, target);
    }
  }
  const excludedTypeChecked = typeChecked.filter((file) => !uploaded(file));
  const excludedGlobals = excludedTypeChecked
    .filter((file) => {
      const source = ts.createSourceFile(
        file,
        readFileSync(join(root, file), "utf8"),
        ts.ScriptTarget.Latest,
      );
      return (
        !ts.isExternalModule(source) ||
        source.statements.some(
          (statement) =>
            ts.isModuleDeclaration(statement) &&
            (ts.isStringLiteral(statement.name) ||
              (statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0),
        )
      );
    })
    .sort();
  const byPath = (a, b) =>
    a.from === b.from ? (a.specifier < b.specifier ? -1 : 1) : a.from < b.from ? -1 : 1;
  return {
    typeChecked: roots,
    scanned: [...seen],
    excludedTypeChecked,
    excludedImports: excludedImports.sort(byPath),
    excludedGlobals,
  };
}
