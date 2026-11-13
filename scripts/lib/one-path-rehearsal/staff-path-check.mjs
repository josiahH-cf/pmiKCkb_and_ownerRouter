// S284 ARCH-S284-2 (R-S284-2, AC-S284-2): the staff-path rule as a static check. A journey reaches
// its state through visible controls, the stand-in hooks of scripts/one-path-rehearsal-control.mjs
// and the worker tick. It never posts the sequences route itself to refresh, resume, send or
// schedule a message.
//
// Each file is parsed with the TypeScript compiler, whose checker resolves names by scope. A call
// is a direct call when one of its arguments is the route and a later argument is a body whose
// action is one of those four. The route may be a string, a template, a constant, a concatenation,
// a property of a constant object, an element of an evaluate argument list or the url of an
// options object. The action may be an `action` property, a spread, a JSON body
// (`body: JSON.stringify(...)`), Playwright's `data`, or an argument the file passes to a helper
// that makes the call. Code held in a string that names the route and one of the actions counts
// too. Only the sequences route accepts these four actions, so a route the file does not show (an
// imported constant or a path parameter, named like a route) counts when the body names one of
// them. A body whose action the file does not show, sent to the route, is reported as
// "unresolved": the check fails closed. Reads, waits on the request a staff click makes, and the
// route's other actions (save, reconcile, pause, cancel and transfer) pass.
//
// scripts/check-staff-path-calls.mjs runs it over this batch's drivers and journey modules, the
// rehearsal seed and the November 10 core journeys, whose N10-02 S284 R-S284-4 replays on the
// staff path. On the starting tree the seed and the November 10 core journeys post these actions
// directly; that is the recorded fail-first state, and S275 R-S275-8 replaces those calls.
import ts from "typescript";

export const SEQUENCES_ROUTE = "/api/gmail-hub/sequences";
export const STAFF_PATH_ACTIONS = Object.freeze([
  "refresh",
  "resume",
  "send",
  "schedule",
]);
export const UNRESOLVED_ACTION = "unresolved";
export const REHEARSAL_SEED = "scripts/lib/one-path-rehearsal/seeds.mjs";
export const NOVEMBER_10_CORE_JOURNEYS =
  "tests/browser/one-path-november-10-core-journeys.mjs";
// This batch's drivers and journey modules, including files added later.
export const BATCH_FILE = /^tests\/browser\/one-path-november-12-[^/]+\.mjs$/;

/**
 * The default file list from repository-relative candidate paths (the CLI passes the entries of
 * tests/browser): this batch's files in name order, then the seed and the November 10 core
 * journeys, which are always listed.
 */
export function selectStaffPathFiles(paths = []) {
  const batch = [...new Set(paths.map((path) => String(path).replaceAll("\\", "/")))]
    .filter((path) => BATCH_FILE.test(path))
    .sort();
  return [...batch, REHEARSAL_SEED, NOVEMBER_10_CORE_JOURNEYS];
}

// The route as a value, not followed by a further path segment ("/thread") or a name character.
const ROUTE = /\/api\/gmail-hub\/sequences(?!\/?[\w-])/;
// A helper may add the /api prefix itself.
const RELATIVE_ROUTE = /^\/?(?:api\/)?gmail-hub\/sequences(?!\/?[\w-])/;
// An action written as code or JSON text.
const ACTION_TEXT = /["']?\baction["']?\s*:\s*["'`]([A-Za-z_]+)["'`]/g;
// Where a request helper or an options object carries the body, and where it carries the url.
const BODY_KEYS = new Set(["body", "data", "json", "form", "payload", "postData"]);
const URL_KEYS = new Set([
  "url",
  "path",
  "href",
  "pathname",
  "endpoint",
  "route",
  "input",
  "uri",
  "resource",
]);
// A name that reads like a route: an imported SEQUENCES, a `path` or `url` parameter.
const ROUTE_NAME = /url|uri|path|href|route|endpoint|resource|sequences/i;
// Stand for a part of a string the file does not show, and for one named like a route.
const HOLE = "\u0000";
const ROUTE_HOLE = "\u0001";
const hidden = (value) => value.includes(HOLE) || value.includes(ROUTE_HOLE);
const MAX_DEPTH = 16;
const MAX_VALUES = 64;

const SCRIPT_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;

function scriptKind(name) {
  if (name.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (name.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?ts$/.test(name)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** One file's syntax tree and a checker that resolves its names. Nothing outside the text is read. */
function analysis(file, text) {
  const name = "/staff-path-check/input" + (SCRIPT_EXTENSION.exec(file)?.[0] ?? ".mjs");
  const sourceFile = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(name),
  );
  const host = {
    fileExists: (candidate) => candidate === name,
    readFile: (candidate) => (candidate === name ? text : undefined),
    getSourceFile: (candidate) => (candidate === name ? sourceFile : undefined),
    getDefaultLibFileName: () => "/staff-path-check/lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "/staff-path-check",
    getDirectories: () => [],
    getCanonicalFileName: (candidate) => candidate,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };
  const program = ts.createProgram({
    rootNames: [name],
    options: { allowJs: true, noLib: true, noResolve: true, types: [], noEmit: true },
    host,
  });
  return {
    sourceFile,
    program,
    checker: program.getTypeChecker(),
    assignments: null,
    references: null,
  };
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isAwaitExpression(current))
  )
    current = current.expression;
  return current;
}

function limited(values) {
  const unique = [...new Set(values)];
  return unique.length > MAX_VALUES ? [...unique.slice(0, MAX_VALUES), HOLE] : unique;
}

function combine(parts) {
  let values = [""];
  for (const part of parts) {
    const next = [];
    for (const prefix of values) for (const value of part) next.push(prefix + value);
    values = limited(next);
  }
  return values;
}

function symbolOf(identifier, context) {
  const parent = identifier.parent;
  if (parent && ts.isShorthandPropertyAssignment(parent) && parent.name === identifier)
    return context.checker.getShorthandAssignmentValueSymbol(parent);
  return context.checker.getSymbolAtLocation(identifier);
}

function propertyKey(name, context) {
  if (!name) return null;
  if (
    ts.isIdentifier(name) ||
    ts.isPrivateIdentifier(name) ||
    ts.isStringLiteralLike(name) ||
    ts.isNumericLiteral(name)
  )
    return name.text;
  if (ts.isComputedPropertyName(name)) {
    const values = stringValues(name.expression, context);
    return values.length === 1 && !hidden(values[0]) ? values[0] : null;
  }
  return null;
}

function assignmentsTo(symbol, context) {
  if (!context.assignments) {
    const found = new Map();
    const visit = (node) => {
      if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left)) {
        const kind = node.operatorToken.kind;
        const plain = kind === ts.SyntaxKind.EqualsToken;
        const compound =
          kind >= ts.SyntaxKind.FirstCompoundAssignment &&
          kind <= ts.SyntaxKind.LastCompoundAssignment;
        const target =
          plain || compound ? context.checker.getSymbolAtLocation(node.left) : null;
        // A compound assignment's result is not shown, so the whole expression stands for it.
        if (target)
          found.set(target, [...(found.get(target) ?? []), plain ? node.right : node]);
      }
      ts.forEachChild(node, visit);
    };
    visit(context.sourceFile);
    context.assignments = found;
  }
  return context.assignments.get(symbol) ?? [];
}

function referencesTo(symbol, context) {
  if (!context.references) {
    const found = new Map();
    const note = (target, identifier) => {
      if (target) found.set(target, [...(found.get(target) ?? []), identifier]);
    };
    const visit = (node) => {
      if (ts.isIdentifier(node))
        note(
          ts.isExportSpecifier(node.parent)
            ? context.checker.getExportSpecifierLocalTargetSymbol(node.parent)
            : symbolOf(node, context),
          node,
        );
      ts.forEachChild(node, visit);
    };
    visit(context.sourceFile);
    context.references = found;
  }
  return context.references.get(symbol) ?? [];
}

/**
 * One level of helper: a parameter holds the arguments this file passes at each call of its
 * function. A function that is exported, passed on as a value or not bound to a name has callers
 * the file cannot show (null).
 */
function argumentsFor(parameter, context) {
  const fn = parameter.parent;
  if (parameter.dotDotDotToken || !ts.isFunctionLike(fn)) return null;
  const index = fn.parameters.indexOf(parameter);
  const declaration = ts.isFunctionDeclaration(fn)
    ? fn
    : (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
        ts.isVariableDeclaration(fn.parent) &&
        fn.parent.initializer === fn
      ? fn.parent
      : null;
  if (!declaration?.name || !ts.isIdentifier(declaration.name)) return null;
  if (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) return null;
  const symbol = context.checker.getSymbolAtLocation(declaration.name);
  if (!symbol) return null;
  const passed = [];
  for (const reference of referencesTo(symbol, context)) {
    if (reference === declaration.name) continue;
    const call = reference.parent;
    if (!ts.isCallExpression(call) || call.expression !== reference) return null;
    if (call.arguments.slice(0, index + 1).some(ts.isSpreadElement)) return null;
    if (call.arguments[index]) passed.push({ expression: call.arguments[index] });
  }
  return passed;
}

/**
 * What a name can hold: { expression } entries, { imported: true } for an import, or null for a
 * value the file does not show (a global, a destructured name, or a parameter whose callers are
 * unknown; for the route, which must be visible where the call is made, any parameter).
 */
function candidatesOf(identifier, context, parameters) {
  const symbol = symbolOf(identifier, context);
  if (!symbol?.declarations?.length) return [null];
  if (symbol.flags & ts.SymbolFlags.Alias) return [{ imported: true }];
  const found = [];
  for (const declaration of symbol.declarations) {
    if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
      if (declaration.initializer) found.push({ expression: declaration.initializer });
      if (!(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const))
        for (const expression of assignmentsTo(symbol, context))
          found.push({ expression });
    } else if (ts.isParameter(declaration) && ts.isIdentifier(declaration.name)) {
      if (declaration.initializer) found.push({ expression: declaration.initializer });
      const passed = parameters ? argumentsFor(declaration, context) : null;
      if (passed === null) found.push(null);
      else found.push(...passed);
    } else if (
      ts.isFunctionDeclaration(declaration) ||
      ts.isClassDeclaration(declaration)
    ) {
      found.push({ expression: declaration });
    } else {
      found.push(null);
    }
  }
  return found;
}

function memberKey(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  const argument = node.argumentExpression;
  return ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument)
    ? argument.text
    : null;
}

/** The property a member expression reads from an object literal the file binds to a name. */
function memberCandidates(node, context, parameters) {
  const key = memberKey(node);
  const object = unwrap(node.expression);
  if (key === null || !ts.isIdentifier(object)) return [null];
  const found = [];
  for (const candidate of candidatesOf(object, context, parameters)) {
    if (candidate?.imported) {
      found.push(candidate);
      continue;
    }
    const value = candidate && unwrap(candidate.expression);
    if (!value || !ts.isObjectLiteralExpression(value)) {
      found.push(null);
      continue;
    }
    const property = value.properties.find(
      (entry) =>
        (ts.isPropertyAssignment(entry) || ts.isShorthandPropertyAssignment(entry)) &&
        propertyKey(entry.name, context) === key,
    );
    if (property)
      found.push({
        expression: ts.isPropertyAssignment(property)
          ? property.initializer
          : property.name,
      });
    else if (value.properties.some(ts.isSpreadAssignment)) found.push(null);
  }
  return found;
}

function valuesOf(node, context, parameters) {
  return ts.isIdentifier(node)
    ? candidatesOf(node, context, parameters)
    : memberCandidates(node, context, parameters);
}

/** Whether a name the file cannot resolve reads like a route (an imported SEQUENCES, a path). */
function routeLike(node, context) {
  if (ts.isIdentifier(node)) {
    const names = [node.text];
    for (const declaration of symbolOf(node, context)?.declarations ?? [])
      if (ts.isImportSpecifier(declaration) && declaration.propertyName)
        names.push(declaration.propertyName.text);
    return names.some((name) => ROUTE_NAME.test(name));
  }
  const key = memberKey(node);
  return key !== null && ROUTE_NAME.test(key);
}

/** The strings an expression can be; HOLE and ROUTE_HOLE mark parts the file does not show. */
function stringValues(node, context, { parameters = false } = {}, stack = new Set()) {
  const expression = unwrap(node);
  if (!expression || stack.has(expression) || stack.size >= MAX_DEPTH) return [HOLE];
  stack.add(expression);
  try {
    const values = (part) => stringValues(part, context, { parameters }, stack);
    if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression))
      return [expression.text];
    if (ts.isTemplateExpression(expression))
      return combine([
        [expression.head.text],
        ...expression.templateSpans.flatMap((span) => [
          values(span.expression),
          [span.literal.text],
        ]),
      ]);
    if (ts.isBinaryExpression(expression)) {
      const kind = expression.operatorToken.kind;
      if (kind === ts.SyntaxKind.PlusToken)
        return combine([values(expression.left), values(expression.right)]);
      if (
        kind === ts.SyntaxKind.BarBarToken ||
        kind === ts.SyntaxKind.QuestionQuestionToken
      )
        return limited([...values(expression.left), ...values(expression.right)]);
      if (
        kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        kind === ts.SyntaxKind.CommaToken
      )
        return values(expression.right);
      return [HOLE];
    }
    if (ts.isConditionalExpression(expression))
      return limited([...values(expression.whenTrue), ...values(expression.whenFalse)]);
    if (
      ts.isIdentifier(expression) ||
      ts.isPropertyAccessExpression(expression) ||
      ts.isElementAccessExpression(expression)
    ) {
      const unseen = routeLike(expression, context) ? ROUTE_HOLE : HOLE;
      return limited(
        valuesOf(expression, context, parameters).flatMap((candidate) =>
          candidate && !candidate.imported ? values(candidate.expression) : [unseen],
        ),
      );
    }
    return [HOLE];
  } finally {
    stack.delete(expression);
  }
}

/** "certain" when the file shows the route, "possible" when a name read like a route may hold it. */
function routeKind(node, context) {
  const values = stringValues(node, context);
  if (values.some((value) => ROUTE.test(value) || RELATIVE_ROUTE.test(value)))
    return "certain";
  if (
    values.some(
      (value) =>
        value.includes(ROUTE_HOLE) &&
        ROUTE.test(value.replaceAll(ROUTE_HOLE, SEQUENCES_ROUTE)),
    )
  )
    return "possible";
  return null;
}

function isJsonStringify(call) {
  const callee = call.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "stringify" &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "JSON"
  );
}

function isEmptyValue(node) {
  return (
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isNumericLiteral(node) ||
    ts.isBigIntLiteral(node) ||
    ts.isRegularExpressionLiteral(node) ||
    ts.isVoidExpression(node) ||
    (ts.isIdentifier(node) && node.text === "undefined")
  );
}

const unresolved = (node) => [{ action: UNRESOLVED_ACTION, node }];

function actionValues(node, context) {
  const values = stringValues(node, context, { parameters: true });
  if (!values.length) return unresolved(node);
  return values.map((value) => ({
    action: hidden(value) ? UNRESOLVED_ACTION : value,
    node,
  }));
}

function textActions(node, context) {
  const found = [];
  for (const value of stringValues(node, context, { parameters: true })) {
    const actions = [...value.matchAll(ACTION_TEXT)].map((match) => match[1]);
    if (actions.length) found.push(...actions.map((action) => ({ action, node })));
    else if (hidden(value)) found.push(...unresolved(node));
  }
  return found;
}

// Later properties override earlier ones; a spread may or may not set the action.
function objectActions(object, context, stack) {
  let current = [];
  const nested = [];
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      current = [...current, ...bodyActions(property.expression, context, stack)];
    } else if (ts.isShorthandPropertyAssignment(property)) {
      const name = property.name.text;
      if (name === "action") current = actionValues(property.name, context);
      else if (BODY_KEYS.has(name))
        nested.push(...bodyActions(property.name, context, stack));
    } else {
      const name = propertyKey(property.name, context);
      if (ts.isPropertyAssignment(property)) {
        if (name === null) current = [...current, ...unresolved(property)];
        else if (name === "action") current = actionValues(property.initializer, context);
        else if (BODY_KEYS.has(name))
          nested.push(...bodyActions(property.initializer, context, stack));
      } else if (name === null || name === "action") {
        // A getter or method that may supply the action.
        current = [...current, ...unresolved(property)];
      }
    }
  }
  return [...current, ...nested];
}

/**
 * The actions a request body can carry, as { action, node } entries, where node is what the
 * action was read from. UNRESOLVED_ACTION marks a body whose action the file does not show.
 */
function bodyActions(node, context, stack = new Set()) {
  const expression = unwrap(node);
  if (!expression) return [];
  if (stack.has(expression) || stack.size >= MAX_DEPTH) return unresolved(expression);
  stack.add(expression);
  try {
    const inner = (part) => bodyActions(part, context, stack);
    if (ts.isFunctionLike(expression) || ts.isClassLike(expression)) return [];
    if (isEmptyValue(expression)) return [];
    if (ts.isObjectLiteralExpression(expression))
      return objectActions(expression, context, stack);
    if (ts.isArrayLiteralExpression(expression))
      return expression.elements.flatMap((element) =>
        inner(ts.isSpreadElement(element) ? element.expression : element),
      );
    if (ts.isStringLiteralLike(expression) || ts.isTemplateExpression(expression))
      return textActions(expression, context);
    if (ts.isCallExpression(expression) || ts.isNewExpression(expression)) {
      const args = [...(expression.arguments ?? [])];
      if (isJsonStringify(expression)) return args.length ? inner(args[0]) : [];
      const found = args.flatMap((argument) =>
        inner(ts.isSpreadElement(argument) ? argument.expression : argument),
      );
      return found.length ? found : unresolved(expression);
    }
    if (ts.isConditionalExpression(expression))
      return [...inner(expression.whenTrue), ...inner(expression.whenFalse)];
    if (ts.isBinaryExpression(expression)) {
      const kind = expression.operatorToken.kind;
      if (
        kind === ts.SyntaxKind.BarBarToken ||
        kind === ts.SyntaxKind.QuestionQuestionToken
      )
        return [...inner(expression.left), ...inner(expression.right)];
      if (
        kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        kind === ts.SyntaxKind.CommaToken
      )
        return inner(expression.right);
      return unresolved(expression);
    }
    if (
      ts.isIdentifier(expression) ||
      ts.isPropertyAccessExpression(expression) ||
      ts.isElementAccessExpression(expression)
    )
      return valuesOf(expression, context, true).flatMap((candidate) =>
        candidate && !candidate.imported
          ? inner(candidate.expression)
          : unresolved(expression),
      );
    return unresolved(expression);
  } finally {
    stack.delete(expression);
  }
}

/** An argument as literals: itself, or the array and object literals a name binds it to. */
function literalsOf(node, context) {
  const expression = unwrap(node);
  if (!expression) return [];
  if (!ts.isIdentifier(expression)) return [expression];
  return candidatesOf(expression, context, false)
    .map((candidate) => candidate?.expression && unwrap(candidate.expression))
    .filter(
      (value) =>
        value &&
        (ts.isArrayLiteralExpression(value) || ts.isObjectLiteralExpression(value)),
    );
}

function urlKind(property, context) {
  if (
    ts.isPropertyAssignment(property) &&
    URL_KEYS.has(propertyKey(property.name, context))
  )
    return routeKind(property.initializer, context);
  if (ts.isShorthandPropertyAssignment(property) && URL_KEYS.has(property.name.text))
    return routeKind(property.name, context);
  return null;
}

/**
 * The arguments after the route when a call carries it, as { payload, certain }, else null. A
 * route the file shows wins over one a name may hold.
 */
function routePayload(call, context) {
  const args = [...(call.arguments ?? [])];
  let possible = null;
  const found = (kind, payload) => {
    if (kind === "certain") return { payload, certain: true };
    if (kind === "possible" && !possible) possible = { payload, certain: false };
    return null;
  };
  for (const [index, argument] of args.entries()) {
    if (ts.isSpreadElement(argument)) continue;
    const rest = args.slice(index + 1);
    const direct = found(routeKind(argument, context), rest);
    if (direct) return direct;
    for (const literal of literalsOf(argument, context)) {
      if (ts.isArrayLiteralExpression(literal)) {
        for (const [at, element] of literal.elements.entries()) {
          if (ts.isSpreadElement(element)) continue;
          const listed = found(routeKind(element, context), [
            ...literal.elements.slice(at + 1),
            ...rest,
          ]);
          if (listed) return listed;
        }
      } else if (ts.isObjectLiteralExpression(literal)) {
        for (const property of literal.properties) {
          const option = found(urlKind(property, context), [literal, ...rest]);
          if (option) return option;
        }
      }
    }
  }
  return possible;
}

function lineOf(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function analyzeFile(file, text) {
  const context = analysis(file, text);
  const { sourceFile } = context;
  const unparsed = context.program
    .getSyntacticDiagnostics(sourceFile)
    .map((diagnostic) => ({
      file,
      line: diagnostic.start === undefined ? null : lineOf(sourceFile, diagnostic.start),
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    }));
  const reports = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const route = routePayload(node, context);
      for (const { action, node: source } of (route?.payload ?? []).flatMap(
        (expression) => bodyActions(expression, context),
      ))
        if (
          STAFF_PATH_ACTIONS.includes(action) ||
          (route.certain && action === UNRESOLVED_ACTION)
        )
          reports.push({ node, action, source, kind: "call", certain: route.certain });
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      const text = ts.isTemplateExpression(node)
        ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(
            HOLE,
          )
        : node.text;
      if (ROUTE.test(text))
        for (const match of text.matchAll(ACTION_TEXT))
          if (STAFF_PATH_ACTIONS.includes(match[1]))
            reports.push({
              node,
              action: match[1],
              source: node,
              kind: "text",
              certain: true,
            });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  // A helper that only may carry the route also sees the actions of the calls that pass it the
  // route; those calls are reported themselves.
  const shown = reports.filter((report) => report.certain);
  const kept = reports.filter(
    (report) =>
      report.certain ||
      !shown.some(
        (other) =>
          other.action === report.action &&
          report.source.pos >= other.node.pos &&
          report.source.end <= other.node.end,
      ),
  );
  const violations = [];
  const seen = new Set();
  for (const { node, action, source, kind, certain } of kept) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    const actionLine = lineOf(sourceFile, source.getStart(sourceFile));
    const key = `${line}:${character}:${action}:${actionLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A helper's action is named where the file calls the helper, and a body built earlier is
    // made on its own line: both lie outside the call itself.
    const outside =
      actionLine < line + 1 || actionLine > lineOf(sourceFile, node.getEnd());
    violations.push({
      file,
      line: line + 1,
      column: character + 1,
      action,
      kind,
      ...(certain ? {} : { route: "not shown" }),
      ...(outside ? { actionLine } : {}),
    });
  }
  violations.sort(
    (left, right) =>
      left.line - right.line ||
      left.column - right.column ||
      left.action.localeCompare(right.action),
  );
  return { violations, unparsed };
}

/**
 * Every direct refresh, resume, send or schedule call of the sequences route in one file's text,
 * as { file, line, column, action, kind }: `kind` is "call" or "text" (code held in a string),
 * `route` is "not shown" when a name read like a route holds it, and `actionLine` is where a
 * helper's caller names the action, or where an unresolved body is made, when that is outside
 * the call.
 */
export function findDirectSequenceCalls(text, { file = "<inline>" } = {}) {
  return analyzeFile(file, String(text)).violations;
}

/**
 * The check over a file list, as [{ file, text }]. It passes only when no file makes such a call
 * and every file parses; a file that does not parse cannot be shown clean.
 */
export function checkStaffPathCalls(entries = []) {
  const files = [];
  const violations = [];
  const unparsed = [];
  for (const { file, text } of entries) {
    files.push(file);
    const result = analyzeFile(file, String(text));
    violations.push(...result.violations);
    unparsed.push(...result.unparsed);
  }
  return {
    route: SEQUENCES_ROUTE,
    actions: [...STAFF_PATH_ACTIONS],
    files,
    violations,
    unparsed,
    passed: violations.length === 0 && unparsed.length === 0,
  };
}

function notesFor(violation) {
  const notes = [];
  if (violation.kind === "text") notes.push("in code text");
  if (violation.route) notes.push(`route ${violation.route}`);
  if (violation.actionLine)
    notes.push(
      violation.action === UNRESOLVED_ACTION
        ? `body from line ${violation.actionLine}`
        : `action given at line ${violation.actionLine}`,
    );
  return notes.length ? ` (${notes.join("; ")})` : "";
}

/** The check's result as the CLI prints it: file, line, column and action per call. */
export function formatStaffPathResult(result) {
  const lines = [];
  const { files, violations, unparsed } = result;
  if (violations.length) {
    const touched = new Set(violations.map(({ file }) => file)).size;
    lines.push(
      `Staff path check failed (S284 R-S284-2): ${violations.length} direct call(s) of ${SEQUENCES_ROUTE} in ${touched} of ${files.length} file(s).`,
    );
    for (const violation of violations)
      lines.push(
        `- ${violation.file}:${violation.line}:${violation.column} ${violation.action}${notesFor(violation)}`,
      );
    if (violations.some(({ action }) => action === UNRESOLVED_ACTION))
      lines.push(
        "An unresolved call sends the route a body whose action this file does not show; the check fails closed.",
      );
    lines.push(
      "Reach these outcomes through visible controls, the stand-in hooks and the worker tick.",
    );
  } else if (!unparsed.length) {
    lines.push(
      `Staff path check passed (S284 R-S284-2): ${files.length} file(s), no direct refresh, resume, send or schedule call of ${SEQUENCES_ROUTE}.`,
    );
  }
  for (const entry of unparsed)
    lines.push(
      `- ${entry.file}${entry.line ? `:${entry.line}` : ""} could not be parsed: ${entry.message}`,
    );
  lines.push(`Scanned: ${files.join(", ")}.`);
  return lines.join("\n") + "\n";
}
