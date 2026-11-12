// Cloud Run builds from the source upload, which leaves out every `.gcloudignore` path, but local
// verification and CI build the full tree. On 2026-11-12 release run d3a71afe stopped at deploy:
// a type-checked test statically imported an upload-excluded rehearsal fixture, so every local
// and CI gate passed while Cloud Build b6077224 failed with TS2307. This gate checks the upload
// itself, without gcloud.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findUploadOnlyFailures,
  isUploaded,
  readUploadIgnore,
  uploadSet,
} from "../helpers/upload-set.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "pmi-upload-set-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return { root, files: Object.keys(files) };
}
const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noEmit: true,
    module: "esnext",
    moduleResolution: "bundler",
    resolveJsonModule: true,
    jsx: "react-jsx",
    paths: { "@/*": ["./*"] },
  },
  include: ["**/*.ts", "**/*.tsx"],
  exclude: ["node_modules", "temp"],
});

describe("upload set", () => {
  it("follows gcloud's ignore semantics where they differ from Git", () => {
    const { root } = tree({
      ".gcloudignore": [
        "# Comments and blank lines are skipped.",
        "",
        "#!include:.gitignore",
        "docs/specs/",
        "/golden-data/",
        "output/",
        "notes.txt   ",
        "\\#literal",
        "node_modules/",
        "!node_modules/kept.js",
      ].join("\n"),
      ".gitignore": [
        "#!include:.nested",
        "*.log",
        "docs/temp/*",
        "!docs/temp/",
        "!docs/temp/README.md",
      ].join("\r\n"),
      ".nested": "nested-only.ts\n",
    });
    const patterns = readUploadIgnore(root);
    const uploaded = (path, isDir) => isUploaded(patterns, path, isDir);
    // A middle slash does not anchor a gcloud pattern; only a leading slash does.
    expect(uploaded("docs/specs/a.md")).toBe(false);
    expect(uploaded("lib/docs/specs/a.md")).toBe(false);
    expect(uploaded("golden-data/a.json")).toBe(false);
    expect(uploaded("lib/golden-data/a.json")).toBe(true);
    // A trailing slash matches only directories; trailing spaces are dropped; `\#` is literal.
    expect(uploaded("output/report.md")).toBe(false);
    expect(uploaded("lib/output")).toBe(true);
    expect(uploaded("lib/notes.txt")).toBe(false);
    expect(uploaded("#literal")).toBe(false);
    // The included .gitignore applies in order; its own include line does not.
    expect(uploaded("server.log")).toBe(false);
    expect(uploaded("docs/temp/scratch.ts")).toBe(false);
    expect(uploaded("docs/temp/README.md")).toBe(true);
    expect(uploaded("nested-only.ts")).toBe(true);
    // A file under an ignored directory cannot be re-included.
    expect(uploaded("node_modules/kept.js")).toBe(false);
    expect(uploaded("lib/node_modules", true)).toBe(false);
  });

  it("names each import form that reaches a file the upload leaves out", () => {
    const { root, files } = tree({
      "tsconfig.json": TSCONFIG,
      ".gcloudignore": "fixtures/excluded*\nfixtures/globals.d.ts\nfixtures/augment.ts\n",
      "fixtures/excluded.ts": "export const value = 1;\n",
      "fixtures/excluded.css": ".x {}\n",
      "fixtures/excluded.mjs": "export const value = 1;\n",
      "fixtures/globals.d.ts": "declare const rehearsalGlobal: string;\n",
      "fixtures/augment.ts":
        "export {};\ndeclare global {\n  interface Window { x: 1 }\n}\n",
      "fixtures/local.ts": "export const local = 1;\n",
      "lib/uploaded.mjs": 'export { value } from "../fixtures/excluded.mjs";\n',
      "static.test.ts":
        'import { value } from "./fixtures/excluded";\nexport { value };\n',
      "alias.ts":
        'import type { value } from "@/fixtures/excluded";\nexport type V = typeof value;\n',
      "literal.ts": 'export const load = () => import("./fixtures/excluded");\n',
      "query.ts": 'export type Q = typeof import("./fixtures/excluded");\n',
      "reference.ts": '/// <reference path="./fixtures/globals.d.ts" />\nexport {};\n',
      "styles.tsx": 'import "./fixtures/excluded.css";\nexport const S = () => null;\n',
      "through-js.ts": 'export { value } from "./lib/uploaded.mjs";\n',
      // The repair shape from 7f4cf234: a non-literal specifier TypeScript never resolves.
      "dynamic.test.ts": [
        'const FIXTURE = "./fixtures/excluded";',
        "export const load = () => import(/* @vite-ignore */ FIXTURE);",
      ].join("\n"),
      "clean.ts": 'import { local } from "./fixtures/local";\nexport { local };\n',
    });
    const result = findUploadOnlyFailures(root, { files });
    expect(result.excludedImports).toEqual([
      { from: "alias.ts", specifier: "@/fixtures/excluded", to: "fixtures/excluded.ts" },
      {
        from: "lib/uploaded.mjs",
        specifier: "../fixtures/excluded.mjs",
        to: "fixtures/excluded.mjs",
      },
      {
        from: "literal.ts",
        specifier: "./fixtures/excluded",
        to: "fixtures/excluded.ts",
      },
      { from: "query.ts", specifier: "./fixtures/excluded", to: "fixtures/excluded.ts" },
      {
        from: "reference.ts",
        specifier: "./fixtures/globals.d.ts",
        to: "fixtures/globals.d.ts",
      },
      {
        from: "static.test.ts",
        specifier: "./fixtures/excluded",
        to: "fixtures/excluded.ts",
      },
      {
        from: "styles.tsx",
        specifier: "./fixtures/excluded.css",
        to: "fixtures/excluded.css",
      },
    ]);
    expect(result.excludedGlobals).toEqual([
      "fixtures/augment.ts",
      "fixtures/globals.d.ts",
    ]);
    expect(result.scanned).toContain("dynamic.test.ts");
    expect(result.scanned).toContain("fixtures/local.ts");
  });

  it(
    "keeps every import from this checkout's type-checked upload inside the upload",
    { timeout: 120_000 },
    () => {
      const root = process.cwd();
      const result = findUploadOnlyFailures(root);
      // The gate must see the real exclusions and the file that broke run d3a71afe.
      expect(result.excludedTypeChecked).toEqual(
        expect.arrayContaining([
          "tests/browser/fixtures/s260-compiled-mail.ts",
          "tests/browser/fixtures/s271-compiled-stand-in.ts",
        ]),
      );
      expect(result.scanned).toContain(
        "tests/unit/s254-rehearsal-stand-in-fence.test.ts",
      );
      expect(result.typeChecked.length).toBeGreaterThan(1000);
      expect(
        result.excludedImports,
        "Cloud Build type-checks only the upload. Load these .gcloudignore'd files through a " +
          "non-literal dynamic import, or stop excluding them.",
      ).toEqual([]);
      expect(
        result.excludedGlobals,
        "These .gcloudignore'd type-checked files declare globals or augment modules that the " +
          "upload would lose. Make each a plain module, or stop excluding it.",
      ).toEqual([]);
      expect(uploadSet(root)).not.toContain(
        "tests/browser/fixtures/s271-compiled-stand-in.ts",
      );
    },
  );
});
