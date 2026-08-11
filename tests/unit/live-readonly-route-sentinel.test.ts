import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  LIVE_READONLY_ALLOWED_NON_SAFE_REQUESTS,
  decideLiveReadonlyRequest,
} from "@/lib/environment/live-readonly-request-policy";

const ROOT = process.cwd();
const API_ROOT = join(ROOT, "app", "api");
const APP_ROOT = join(ROOT, "app");
const HTTP_METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const LIVE_READONLY_DESCRIPTOR = {
  ok: true as const,
  descriptor: {
    dataContext: "live_readonly" as const,
    environmentKind: "demo" as const,
    source: "explicit" as const,
  },
};

/**
 * Lexically suspicious calls reached from an exported GET handler or a server page load. The
 * inventory is intentionally exact: adding a new boundary requires reviewing whether it is a
 * harmless local operation, a read-only service constructor, or a mutation with a direct fence.
 */
const REVIEWED_BENIGN_READ_BOUNDARIES = new Set([
  "app/api/gmail-hub/communications/route.ts:GET:createGmailHubService",
  "app/api/gmail-hub/connection/route.ts:GET:createGmailHubService",
  "app/api/gmail-hub/threads/[threadId]/route.ts:GET:createGmailHubService",
  "app/api/gmail-hub/threads/route.ts:GET:createGmailHubService",
  "app/api/gmail-hub/threads/route.ts:GET:linkMatchesContext",
  "app/api/gmail-hub/watch/route.ts:GET:createGmailHubService",
  // S66 GET composes only an authenticated app-owned Firestore read handler. Its POST is separately
  // denied by the Live-read-only request policy and the handler's edit + renewals guard.
  "app/api/lease-renewal/packet-truth/route.ts:GET:createPacketTruthGetHandler",
  "app/lease-renewal/live/desk/page.tsx:LiveRenewalDeskPage:end.setUTCDate",
  "app/lease-renewal/live/notices/page.tsx:LiveRenewalNoticesPage:end.setUTCDate",
]);

const REVIEWED_DIRECT_DEFENSE_BOUNDARIES = new Map([
  [
    "app/api/lease-renewal/comp-screenshot/route.ts:GET:reconcileCompScreenshot",
    "comp-screenshot-recovery",
  ],
  [
    "app/api/vendor/tickets/route.ts:GET:confirmVendorPortalAccess",
    "vendor-portal-access",
  ],
  ["app/vendor/page.tsx:VendorPage:confirmVendorPortalAccess", "vendor-portal-access"],
]);

const SUSPICIOUS_CALL_NAME =
  /^(?:ack|activate|add|append|archive|claim|commit|complete|confirm|create|delete|disable|dismiss|dispatch|enable|enqueue|execute|finish|insert|invite|link|mark|mutate|patch|persist|promote|publish|put|reconcile|record|remove|restore|revoke|save|schedule|send|set|submit|trigger|unlink|update|upload|upsert|write)/;

interface ParsedFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sourceFile: ts.SourceFile;
}

interface RouteInventoryEntry extends ParsedFile {
  readonly methods: ReadonlySet<string>;
  readonly pathname: string;
}

interface ScanRoot {
  readonly label: string;
  readonly node: ts.Node;
}

function walkFiles(directory: string, predicate: (path: string) => boolean): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path, predicate));
    else if (predicate(path)) files.push(path);
  }
  return files.sort();
}

function toPosix(path: string) {
  return path.split(sep).join("/");
}

function parseFile(absolutePath: string): ParsedFile {
  const relativePath = toPosix(relative(ROOT, absolutePath));
  return {
    absolutePath,
    relativePath,
    sourceFile: ts.createSourceFile(
      relativePath,
      readFileSync(absolutePath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ),
  };
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return Boolean(
    ts.getModifiers(node as ts.HasModifiers)?.some((modifier) => modifier.kind === kind),
  );
}

function propertyNameText(name: ts.PropertyName | ts.BindingName | undefined) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function collectExportedMethods(sourceFile: ts.SourceFile): Set<string> {
  const methods = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      statement.name &&
      HTTP_METHODS.has(statement.name.text)
    ) {
      methods.add(statement.name.text);
      continue;
    }

    if (
      ts.isVariableStatement(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          HTTP_METHODS.has(declaration.name.text)
        ) {
          methods.add(declaration.name.text);
        } else if (ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements) {
            const exportedName =
              propertyNameText(element.propertyName) ?? propertyNameText(element.name);
            if (exportedName && HTTP_METHODS.has(exportedName)) methods.add(exportedName);
          }
        }
      }
      continue;
    }

    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        const exportedName = element.name.text;
        if (HTTP_METHODS.has(exportedName)) methods.add(exportedName);
      }
    }
  }

  return methods;
}

function pathnameForRoute(absolutePath: string) {
  const routeRelative = toPosix(relative(API_ROOT, absolutePath));
  const suffix =
    routeRelative === "route.ts" ? "" : `/${routeRelative.slice(0, -"/route.ts".length)}`;
  return `/api${suffix}`;
}

function inventoryRoutes(): RouteInventoryEntry[] {
  return walkFiles(API_ROOT, (path) => path.endsWith(`${sep}route.ts`)).map(
    (absolutePath) => {
      const parsed = parseFile(absolutePath);
      return {
        ...parsed,
        methods: collectExportedMethods(parsed.sourceFile),
        pathname: pathnameForRoute(absolutePath),
      };
    },
  );
}

function findFunction(sourceFile: ts.SourceFile, name: string) {
  return sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
}

function topLevelReturnExpressions(functionNode: ts.FunctionLikeDeclaration) {
  const expressions: ts.Expression[] = [];
  if (!functionNode.body) return expressions;
  if (!ts.isBlock(functionNode.body)) return [functionNode.body];

  const visit = (node: ts.Node) => {
    if (node !== functionNode.body && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) {
      expressions.push(node.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(functionNode.body);
  return expressions;
}

function functionBodyFromExpression(expression: ts.Expression): ts.Node | undefined {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression))
    return expression.body;
  return undefined;
}

function factoryHandlerBody(
  sourceFile: ts.SourceFile,
  factoryName: string,
  method: string,
): ts.Node | undefined {
  const factory = findFunction(sourceFile, factoryName);
  if (!factory) return undefined;

  for (const expression of topLevelReturnExpressions(factory)) {
    if (!ts.isObjectLiteralExpression(expression)) continue;
    for (const property of expression.properties) {
      if (!("name" in property) || propertyNameText(property.name) !== method) continue;
      if (ts.isMethodDeclaration(property)) return property.body;
      if (ts.isPropertyAssignment(property))
        return functionBodyFromExpression(property.initializer);
    }
  }
  return undefined;
}

function callFactoryName(expression: ts.Expression | undefined) {
  if (
    !expression ||
    !ts.isCallExpression(expression) ||
    !ts.isIdentifier(expression.expression)
  ) {
    return undefined;
  }
  return expression.expression.text;
}

function factoryReturnedFunctionBody(sourceFile: ts.SourceFile, factoryName: string) {
  const factory = findFunction(sourceFile, factoryName);
  if (!factory) return undefined;
  for (const expression of topLevelReturnExpressions(factory)) {
    const body = functionBodyFromExpression(expression);
    if (body) return body;
  }
  return undefined;
}

function exportedGetRoots(sourceFile: ts.SourceFile): ScanRoot[] {
  const roots: ScanRoot[] = [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      statement.name?.text === "GET" &&
      statement.body
    ) {
      roots.push({ label: "GET", node: statement.body });
      continue;
    }

    if (
      !ts.isVariableStatement(statement) ||
      !hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "GET") {
        const directBody = declaration.initializer
          ? functionBodyFromExpression(declaration.initializer)
          : undefined;
        const factoryName = callFactoryName(declaration.initializer);
        const factoryBody = factoryName
          ? (factoryHandlerBody(sourceFile, factoryName, "GET") ??
            factoryReturnedFunctionBody(sourceFile, factoryName))
          : undefined;
        if (directBody ?? factoryBody)
          roots.push({ label: "GET", node: (directBody ?? factoryBody)! });
        continue;
      }

      if (!ts.isObjectBindingPattern(declaration.name)) continue;
      const exportsGet = declaration.name.elements.some(
        (element) =>
          (propertyNameText(element.propertyName) ?? propertyNameText(element.name)) ===
          "GET",
      );
      if (!exportsGet) continue;
      const factoryName = callFactoryName(declaration.initializer);
      const factoryBody = factoryName
        ? factoryHandlerBody(sourceFile, factoryName, "GET")
        : undefined;
      if (factoryBody) roots.push({ label: "GET", node: factoryBody });
    }
  }

  return roots;
}

function resolveIdentifierFunction(sourceFile: ts.SourceFile, identifier: string) {
  const declaration = findFunction(sourceFile, identifier);
  if (declaration?.body) return { label: identifier, node: declaration.body };

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const variable of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(variable.name) ||
        variable.name.text !== identifier ||
        !variable.initializer
      ) {
        continue;
      }
      const body = functionBodyFromExpression(variable.initializer);
      if (body) return { label: identifier, node: body };
    }
  }
  return undefined;
}

function defaultPageRoots(sourceFile: ts.SourceFile): ScanRoot[] {
  const roots: ScanRoot[] = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword) &&
      statement.body
    ) {
      roots.push({ label: statement.name?.text ?? "default", node: statement.body });
      continue;
    }
    if (!ts.isExportAssignment(statement)) continue;
    if (ts.isIdentifier(statement.expression)) {
      const resolved = resolveIdentifierFunction(sourceFile, statement.expression.text);
      if (resolved) roots.push(resolved);
      continue;
    }
    const body = functionBodyFromExpression(statement.expression);
    if (body) roots.push({ label: "default", node: body });
  }
  return roots;
}

function callName(call: ts.CallExpression) {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  if (
    ts.isElementAccessExpression(call.expression) &&
    call.expression.argumentExpression &&
    ts.isStringLiteral(call.expression.argumentExpression)
  ) {
    return call.expression.argumentExpression.text;
  }
  return undefined;
}

function compactText(node: ts.Node, sourceFile: ts.SourceFile) {
  return node.getText(sourceFile).replace(/\s+/g, " ");
}

function suspiciousBoundariesFor(parsed: ParsedFile, roots: readonly ScanRoot[]) {
  const boundaries = new Set<string>();
  for (const root of roots) {
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const name = callName(node);
        if (name && SUSPICIOUS_CALL_NAME.test(name)) {
          boundaries.add(
            `${parsed.relativePath}:${root.label}:${compactText(node.expression, parsed.sourceFile)}`,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(root.node);
  }
  return boundaries;
}

function suspiciousReadBoundaries(routes: readonly RouteInventoryEntry[]) {
  const boundaries = new Set<string>();
  for (const route of routes) {
    if (!route.methods.has("GET")) continue;
    for (const boundary of suspiciousBoundariesFor(
      route,
      exportedGetRoots(route.sourceFile),
    )) {
      boundaries.add(boundary);
    }
  }

  const pages = walkFiles(APP_ROOT, (path) => path.endsWith(`${sep}page.tsx`)).map(
    parseFile,
  );
  for (const page of pages) {
    for (const boundary of suspiciousBoundariesFor(
      page,
      defaultPageRoots(page.sourceFile),
    )) {
      boundaries.add(boundary);
    }
  }
  return boundaries;
}

function sorted<T>(items: Iterable<T>) {
  return [...items].sort();
}

describe("Live-read-only route sentinel", () => {
  it("contains no retired Production Test-workspace route", () => {
    expect(
      inventoryRoutes()
        .map(({ pathname }) => pathname)
        .filter((pathname) =>
          /\/(?:test|test-runs|test-actions|test-fixtures|test-fixture|test-seed|test-mailbox|fake-acceptance)(?:\/|$)/i.test(
            pathname,
          ),
        ),
    ).toEqual([]);
  });

  it("discovers every exported route method, including factory-returned handlers", () => {
    const routes = inventoryRoutes();
    const compScreenshot = routes.find(
      (route) => route.pathname === "/api/lease-renewal/comp-screenshot",
    );

    expect(routes.length).toBeGreaterThan(100);
    expect(
      routes
        .filter((route) => route.methods.size === 0)
        .map((route) => route.relativePath),
    ).toEqual([]);
    expect(
      routes
        .filter(
          (route) =>
            route.methods.has("GET") && exportedGetRoots(route.sourceFile).length === 0,
        )
        .map((route) => route.relativePath),
    ).toEqual([]);
    expect(sorted(compScreenshot?.methods ?? [])).toEqual(["GET", "POST"]);
  });

  it("denies every non-safe route unless its exact literal tuple is allowlisted", () => {
    const routes = inventoryRoutes();
    const exportedTuples = new Set<string>();

    for (const route of routes) {
      for (const method of route.methods) {
        const tuple = `${method} ${route.pathname}`;
        exportedTuples.add(tuple);
        if (SAFE_HTTP_METHODS.has(method)) continue;

        const decision = decideLiveReadonlyRequest({
          descriptor: LIVE_READONLY_DESCRIPTOR,
          method,
          pathname: route.pathname,
        });
        expect(decision.allowed, tuple).toBe(
          LIVE_READONLY_ALLOWED_NON_SAFE_REQUESTS.has(tuple),
        );
      }
    }

    for (const tuple of LIVE_READONLY_ALLOWED_NON_SAFE_REQUESTS.keys()) {
      const match =
        /^(DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT) (\/api(?:\/[^?#\s]+)?)$/.exec(tuple);
      expect(
        match,
        `${tuple} must be one exact METHOD + literal API pathname`,
      ).not.toBeNull();
      const [, method, pathname] = match!;
      expect(SAFE_HTTP_METHODS.has(method), `${tuple} does not need an exception`).toBe(
        false,
      );
      expect(
        pathname.includes("[") || pathname.includes("]"),
        `${tuple} is not literal`,
      ).toBe(false);
      expect(
        exportedTuples.has(tuple),
        `${tuple} must map to an exported route handler`,
      ).toBe(true);
    }
  });

  it("keeps GET and page-load mutation-shaped calls on the reviewed inventory", () => {
    const actual = suspiciousReadBoundaries(inventoryRoutes());
    const expected = new Set([
      ...REVIEWED_BENIGN_READ_BOUNDARIES,
      ...REVIEWED_DIRECT_DEFENSE_BOUNDARIES.keys(),
    ]);

    expect(sorted(actual)).toEqual(sorted(expected));
  });

  it("proves the reviewed mutation-sensitive reads have direct environment defenses", () => {
    const vendor = parseFile(join(ROOT, "lib", "vendor", "access.ts"));
    const confirmAccess = findFunction(vendor.sourceFile, "confirmVendorPortalAccess");
    expect(confirmAccess?.body).toBeDefined();
    const vendorStatements = confirmAccess!.body!.statements;
    const readOnlyBranchIndex = vendorStatements.findIndex(
      (statement) =>
        ts.isIfStatement(statement) &&
        compactText(statement.expression, vendor.sourceFile).includes(
          "isLiveReadOnlyContext",
        ),
    );
    expect(readOnlyBranchIndex).toBeGreaterThanOrEqual(0);
    expect(
      compactText(vendorStatements[readOnlyBranchIndex], vendor.sourceFile),
    ).toContain("store.isVendorActive");
    expect(
      vendorStatements
        .slice(readOnlyBranchIndex + 1)
        .map((statement) => compactText(statement, vendor.sourceFile))
        .join(" "),
    ).toContain("store.activateVendor");

    const screenshot = parseFile(
      join(ROOT, "lib", "lease-renewal", "comp-screenshot-service.ts"),
    );
    const reconcile = findFunction(screenshot.sourceFile, "reconcileCompScreenshot");
    const executionGuard = findFunction(
      screenshot.sourceFile,
      "assertCompScreenshotExecutionAllowed",
    );
    expect(compactText(reconcile!.body!.statements[0], screenshot.sourceFile)).toBe(
      'await assertCompScreenshotExecutionAllowed(context, "recovery");',
    );
    expect(compactText(executionGuard!.body!.statements[0], screenshot.sourceFile)).toBe(
      "assertLiveProviderActionAllowed(context.descriptor);",
    );

    expect(sorted(REVIEWED_DIRECT_DEFENSE_BOUNDARIES.values())).toEqual([
      "comp-screenshot-recovery",
      "vendor-portal-access",
      "vendor-portal-access",
    ]);
  });
});
