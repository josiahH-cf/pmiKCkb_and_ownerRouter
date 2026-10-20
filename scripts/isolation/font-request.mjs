// Dependency preparation only: read application font declarations as data, never execute them.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [app, manifestFile, output] = process.argv.slice(2);
assert.ok(app && manifestFile && output, "Expected app, source manifest and new output");
const ts = (
  await import(
    pathToFileURL(path.join(app, "node_modules/typescript/lib/typescript.js")).href
  )
).default;
const nextRoot = path.join(app, "node_modules/next");
const googleRoot = path.join(nextRoot, "dist/compiled/@next/font/dist/google");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function stringValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isParenthesizedExpression(node)) return stringValue(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
    return stringValue(node.left) + stringValue(node.right);
  throw new Error("The reviewed font request requires literal strings");
}

const declarations = [];
for (const row of JSON.parse(fs.readFileSync(manifestFile, "utf8"))) {
  if (!/^(app|components|lib)\/.*\.(?:ts|tsx)$/.test(row.path)) continue;
  const file = path.join(app, row.path);
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("next/font/google")) continue;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = new Set();
  for (const statement of tree.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.moduleSpecifier.text !== "next/font/google"
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    assert.ok(bindings && ts.isNamedImports(bindings), "Unsupported Google font import");
    for (const element of bindings.elements) {
      assert.equal(element.propertyName?.text ?? element.name.text, "Poppins");
      names.add(element.name.text);
    }
  }
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      names.has(node.expression.text)
    ) {
      assert.equal(node.arguments.length, 1);
      const argument = node.arguments[0];
      assert.ok(ts.isObjectLiteralExpression(argument));
      const values = Object.create(null);
      for (const property of argument.properties) {
        assert.ok(
          ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name),
        );
        const key = property.name.text;
        assert.ok(!Object.hasOwn(values, key), "Duplicate font property");
        values[key] = ts.isArrayLiteralExpression(property.initializer)
          ? property.initializer.elements.map(stringValue)
          : stringValue(property.initializer);
      }
      assert.deepEqual(Object.keys(values).sort(), [
        "display",
        "subsets",
        "variable",
        "weight",
      ]);
      assert.deepEqual([...values.weight].sort(), ["300", "400", "600", "700"]);
      assert.equal(new Set(values.weight).size, 4);
      assert.deepEqual(values.subsets, ["latin"]);
      assert.equal(values.display, "swap");
      assert.equal(values.variable, "--font-poppins");
      declarations.push({ file: row.path, sourceSha256: sha(source), ...values });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
assert.equal(
  declarations.length,
  1,
  "Review any changed or additional Google font declaration",
);
const declaration = declarations[0];
const fetchResource = path.join(googleRoot, "fetch-resource.js");
const fetchTree = ts.createSourceFile(
  fetchResource,
  fs.readFileSync(fetchResource, "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const agents = [];
function visitAgent(node) {
  if (ts.isPropertyAssignment(node) && node.name.text === "User-Agent")
    agents.push(stringValue(node.initializer));
  ts.forEachChild(node, visitAgent);
}
visitAgent(fetchTree);
assert.equal(agents.length, 1, "Review a changed installed-loader User-Agent");
assert.ok(agents[0].length < 1024 && !/[\r\n]/.test(agents[0]));
const { getFontAxes } = await import(
  pathToFileURL(path.join(googleRoot, "get-font-axes.js")).href
);
const { getGoogleFontsUrl } = await import(
  pathToFileURL(path.join(googleRoot, "get-google-fonts-url.js")).href
);
const cssUrl = getGoogleFontsUrl(
  "Poppins",
  getFontAxes("Poppins", declaration.weight, ["normal"]),
  declaration.display,
);
const result = {
  schemaVersion: "pmikc-public-font-request/v1",
  family: "Poppins",
  weights: declaration.weight,
  subsets: declaration.subsets,
  display: declaration.display,
  cssUrl,
  userAgent: agents[0],
  declaration,
  nextVersion: JSON.parse(fs.readFileSync(path.join(nextRoot, "package.json"), "utf8"))
    .version,
  sourceManifestSha256: sha(fs.readFileSync(manifestFile)),
  installedLoaderSources: [
    "fetch-resource.js",
    "fetch-css-from-google-fonts.js",
    "fetch-font-file.js",
    "get-font-axes.js",
    "get-google-fonts-url.js",
  ].map((name) => ({ name, sha256: sha(fs.readFileSync(path.join(googleRoot, name))) })),
};
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, {
  flag: "wx",
  mode: 0o600,
});
console.log(
  JSON.stringify({
    publicFontRequest: cssUrl,
    sourceManifestSha256: result.sourceManifestSha256,
    nextVersion: result.nextVersion,
  }),
);
