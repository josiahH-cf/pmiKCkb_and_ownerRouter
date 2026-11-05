// S244 R-S244-1: the deterministic inventory of in-app help copy. It parses every .tsx file under
// app/ and components/ with the TypeScript compiler and lists:
//   - inline helper sentences: elements whose className contains `muted`, and Field `hint` text,
//     in scope when they explain what a control reads, saves, needs or does not do;
//   - the conditional help text the static reading shows as `…`: each branch of a conditional
//     (`a ? b : c`) or logical (`a && b` right side; `a || b`, `a ?? b` both sides) expression at
//     any depth in a muted element's children, except inside a nested muted element (listed on its
//     own) and in JSX attributes, and in a Field `hint` whose value is one. A string branch is its
//     text, a template reads `…` for each substitution, JSX reads its static text, a nested
//     conditional or logical expression recurses and anything else reads nothing; each branch is
//     listed under the same scope rule;
//   - the InfoTips outside the renewal About panels (their label and content);
//   - the renewal workspace's Process guide entries (title and explanation).
// The renewal About panels come from lib/lease-renewal/section-help.ts. The S244 enumeration test
// fails when any listed text has no row in the lib/help/copy-disposition/ table.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOTS = ["app", "components"];
// An explanatory sentence says what a control reads, saves, needs or does not do.
const EXPLANATORY =
  /\b(reads?|read back|saves?|saved|records?|recorded|sends?|sent|writes?|written|changes?|changed|needs?|needed|does not|doesn't|do not|nothing|never|only|confirm\w*|approv\w*|creates?|created|prepares?|prepared|applies|applied|copies|copied|opens?|drafts?|refresh\w*|deletes?|removes?|publish\w*|schedul\w*|requires?|required|stays?|uses?|fills?|shows?|lists?)\b/i;
const MIN_WORDS = 6;

function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

export function normalizeCopy(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
}

function attribute(opening, name) {
  for (const prop of opening.attributes.properties) {
    if (ts.isJsxAttribute(prop) && prop.name.getText() === name) return prop;
  }
  return undefined;
}

function literalAttribute(prop) {
  if (!prop?.initializer) return null;
  if (ts.isStringLiteral(prop.initializer)) return prop.initializer.text;
  if (
    ts.isJsxExpression(prop.initializer) &&
    prop.initializer.expression &&
    (ts.isStringLiteral(prop.initializer.expression) ||
      ts.isNoSubstitutionTemplateLiteral(prop.initializer.expression))
  )
    return prop.initializer.expression.text;
  return null;
}

function classNameHasMuted(opening) {
  const prop = attribute(opening, "className");
  const value = literalAttribute(prop);
  if (value !== null) return /(^|\s)muted(\s|$)/.test(value);
  // className={["muted", ...].join(" ")} or template forms
  return prop?.initializer
    ? /["'`\s]muted["'`\s]/.test(prop.initializer.getText())
    : false;
}

/** The static text of JSX children; any expression that is not a string literal reads `…`. */
function jsxText(node) {
  let out = "";
  for (const child of node.children ?? []) {
    if (ts.isJsxText(child)) out += child.getText().replace(/\s+/g, " ");
    else if (ts.isJsxExpression(child)) {
      const expression = child.expression;
      if (!expression) continue;
      if (
        ts.isStringLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)
      )
        out += expression.text;
      else out += "…";
    } else if (ts.isJsxElement(child)) out += jsxText(child);
    else if (ts.isJsxSelfClosingElement(child)) out += "";
    else if (ts.isJsxFragment(child)) out += jsxText(child);
  }
  return out;
}

function tagName(opening) {
  return opening.tagName.getText();
}

function inScope(text) {
  const words = text.replace(/…/g, " ").split(/\s+/).filter(Boolean);
  return words.length >= MIN_WORDS && EXPLANATORY.test(text);
}

function isMutedElement(node) {
  return ts.isJsxElement(node) && classNameHasMuted(node.openingElement);
}

const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function isBranching(node) {
  return (
    ts.isConditionalExpression(node) ||
    (ts.isBinaryExpression(node) && LOGICAL_OPERATORS.has(node.operatorToken.kind))
  );
}

/** The parts that can render: both branches of `a ? b : c`, the right side of `a && b`, and both
 * sides of `a || b` and `a ?? b`. */
function renderedParts(node) {
  if (ts.isConditionalExpression(node)) return [node.whenTrue, node.whenFalse];
  return node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ? [node.right]
    : [node.left, node.right];
}

/** The texts one branch renders; identifiers, calls, element access and the like read nothing. */
function branchTexts(expression) {
  let node = expression;
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return [node.text];
  if (ts.isTemplateExpression(node))
    return [
      node.head.text + node.templateSpans.map((span) => `…${span.literal.text}`).join(""),
    ];
  if (ts.isJsxElement(node) || ts.isJsxFragment(node))
    return isMutedElement(node) ? [] : [jsxText(node)];
  if (isBranching(node)) return renderedParts(node).flatMap(branchTexts);
  return [];
}

/** The branch texts of every conditional and logical expression at any depth under `nodes`,
 * skipping JSX attributes and nested muted elements (the inventory visits those on their own). */
function conditionalCopy(nodes) {
  const texts = [];
  const visit = (node) => {
    if (ts.isJsxAttributes(node) || isMutedElement(node)) return;
    if (isBranching(node)) {
      texts.push(...branchTexts(node));
      renderedParts(node).forEach(visit);
      return;
    }
    ts.forEachChild(node, visit);
  };
  nodes.forEach(visit);
  return texts;
}

/** Lists every in-scope help text under app/ and components/ with its file. */
export function inventoryHelpCopy(root = process.cwd()) {
  const items = [];
  const files = ROOTS.flatMap((dir) => walk(join(root, dir)))
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => relative(root, file).replaceAll("\\", "/"));
  for (const location of files) {
    const source = ts.createSourceFile(
      location,
      readFileSync(join(root, location), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    // Each distinct in-scope branch text of one muted element or one Field hint, once.
    const pushBranches = (texts) => {
      for (const text of new Set(texts.map(normalizeCopy)))
        if (inScope(text)) items.push({ kind: "inline", location, text });
    };
    const visit = (node) => {
      if (isMutedElement(node)) {
        const text = normalizeCopy(jsxText(node));
        if (inScope(text)) items.push({ kind: "inline", location, text });
        pushBranches(conditionalCopy(node.children));
      }
      const opening = ts.isJsxElement(node)
        ? node.openingElement
        : ts.isJsxSelfClosingElement(node)
          ? node
          : null;
      if (opening && tagName(opening) === "Field") {
        const hintProp = attribute(opening, "hint");
        const hint = literalAttribute(hintProp);
        if (hint && inScope(normalizeCopy(hint)))
          items.push({ kind: "inline", location, text: normalizeCopy(hint) });
        let hintExpression =
          hintProp?.initializer && ts.isJsxExpression(hintProp.initializer)
            ? hintProp.initializer.expression
            : undefined;
        while (hintExpression && ts.isParenthesizedExpression(hintExpression))
          hintExpression = hintExpression.expression;
        if (hintExpression && isBranching(hintExpression))
          pushBranches(conditionalCopy([hintExpression]));
      }
      if (
        opening &&
        tagName(opening) === "InfoTip" &&
        !location.endsWith("RenewalSectionHelp.tsx") &&
        !location.endsWith("ui/InfoTip.tsx")
      ) {
        const label = attribute(opening, "label");
        const content = attribute(opening, "content");
        const contentExpression =
          content?.initializer && ts.isJsxExpression(content.initializer)
            ? content.initializer.expression
            : undefined;
        const contentText =
          literalAttribute(content) ??
          (contentExpression &&
          (ts.isJsxElement(contentExpression) || ts.isJsxFragment(contentExpression))
            ? jsxText(contentExpression)
            : (content?.initializer?.getText() ?? ""));
        items.push({
          kind: "infotip",
          location,
          text: normalizeCopy(
            `${literalAttribute(label) ?? label?.initializer?.getText() ?? ""} | ${contentText}`,
          ),
        });
      }
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText() === "PROCESS_GLOSSARY" &&
        node.initializer
      ) {
        const visitEntry = (entry) => {
          if (
            ts.isCallExpression(entry) &&
            entry.expression.getText() === "activityItem" &&
            entry.arguments.length >= 2 &&
            ts.isStringLiteral(entry.arguments[0]) &&
            ts.isStringLiteral(entry.arguments[1])
          ) {
            items.push({
              kind: "process-guide",
              location,
              text: normalizeCopy(
                `activity ${entry.arguments[0].text} | ${entry.arguments[1].text}`,
              ),
            });
            return;
          }
          if (!ts.isObjectLiteralExpression(entry)) return;
          const field = (name) =>
            entry.properties.find(
              (prop) => ts.isPropertyAssignment(prop) && prop.name.getText() === name,
            );
          const title = field("title")?.initializer;
          const explanation = field("explanation")?.initializer;
          if (title && explanation)
            items.push({
              kind: "process-guide",
              location,
              text: normalizeCopy(
                `${title.text ?? title.getText()} | ${explanation.text ?? explanation.getText()}`,
              ),
            });
          const children = field("children")?.initializer;
          if (children && ts.isArrayLiteralExpression(children))
            children.elements.forEach(visitEntry);
        };
        let init = node.initializer;
        while (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init))
          init = init.expression;
        if (ts.isArrayLiteralExpression(init)) init.elements.forEach(visitEntry);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return items;
}

if (process.argv[1] && process.argv[1].endsWith("help-copy-inventory.mjs")) {
  const items = inventoryHelpCopy();
  const counts = items.reduce(
    (acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }),
    {},
  );
  if (process.argv.includes("--json"))
    process.stdout.write(`${JSON.stringify(items, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(counts)}\n`);
}
