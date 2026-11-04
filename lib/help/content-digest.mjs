// S242 R-S242-4 / ARCH-S242-6: a deterministic digest of the help content modules. The newest
// changelog entry records the digest of the content it describes, so editing a guide, reference,
// glossary term or scene without a new HELP_VERSION and changelog entry fails the version test.
// The changelog module itself is excluded (adding an entry must not change the digest it records).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const HELP_CONTENT_DIR = "lib/help/content";
export const HELP_DIGEST_EXCLUDED = new Set(["lib/help/content/changelog.ts"]);

function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

/** Lists the content files that the digest covers, as repository-relative POSIX paths. */
export function helpContentFiles(root = process.cwd()) {
  return walk(join(root, HELP_CONTENT_DIR))
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .filter((file) => /\.(ts|json)$/.test(file) && !HELP_DIGEST_EXCLUDED.has(file))
    .sort();
}

/** sha256 over each covered file's path and LF-normalized text. */
export function helpContentDigest(root = process.cwd()) {
  const hash = createHash("sha256");
  for (const file of helpContentFiles(root)) {
    const text = readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n");
    hash.update(file);
    hash.update("\0");
    hash.update(text);
    hash.update("\0");
  }
  return hash.digest("hex");
}

if (process.argv[1] && process.argv[1].endsWith("content-digest.mjs")) {
  process.stdout.write(`${helpContentDigest()}\n`);
}
