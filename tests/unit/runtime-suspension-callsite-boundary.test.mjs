import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
// Effect-capable owner-run scripts are runtime paths too. Keeping scripts in this scan prevents a
// diagnostic from silently retaining the protected seed-only gate while the serving app uses the
// close-only runtime wrapper.
const RUNTIME_ROOTS = ["app", "components", "lib", "scripts"];
const PROTECTED_GATE = realpathSync(join(ROOT, "lib/integrations/action-gate.ts"));
const PROTECTED_GATE_SOURCE_MARKER = "action-gate";
const ONLY_ALLOWED_IMPORTER = "lib/operations/runtime-suspension-gate.ts";

function runtimeSources() {
  return RUNTIME_ROOTS.flatMap((root) => walk(join(ROOT, root)));
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(?:[cm]?[jt]s|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function moduleSpecifiers(sourceFile) {
  const found = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      found.push({ node: node.moduleSpecifier, value: node.moduleSpecifier.text });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      found.push({
        node: node.moduleReference.expression,
        value: node.moduleReference.expression.text,
      });
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      found.push({ node: node.arguments[0], value: node.arguments[0].text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function resolveModule(fromFile, specifier) {
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  return null;
}

describe("runtime suspension direct-gate call-site boundary", () => {
  it("keeps the protected seed gate behind the runtime-suspension wrapper", () => {
    const bypasses = [];
    for (const file of runtimeSources()) {
      const source = readFileSync(file, "utf8");
      // A static import/export/require that resolves to action-gate must contain its basename.
      // Avoid parsing hundreds of unrelated modules on Windows-mounted workspaces.
      if (!source.includes(PROTECTED_GATE_SOURCE_MARKER)) continue;
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      for (const specifier of moduleSpecifiers(sourceFile)) {
        if (resolveModule(file, specifier.value) !== PROTECTED_GATE) continue;
        const relativeFile = relative(ROOT, file).replaceAll("\\", "/");
        if (relativeFile === ONLY_ALLOWED_IMPORTER) continue;
        const position = sourceFile.getLineAndCharacterOfPosition(
          specifier.node.getStart(sourceFile),
        );
        bypasses.push(
          `${relativeFile}:${position.line + 1} imports ${JSON.stringify(specifier.value)}`,
        );
      }
    }

    expect(bypasses).toEqual([]);
  }, 20_000);
});
