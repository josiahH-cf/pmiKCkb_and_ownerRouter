import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Governance invariant (A5): the app has exactly ONE unauthenticated write endpoint, and it is the
// tokenized public maintenance intake. This test enumerates EVERY app/api/**/route.ts and fails if any
// route lacks a throwing auth guard unless it is on the small, explicit allow-list — so a future route
// cannot silently ship without auth, and the public route cannot silently acquire an authed-write or
// session-escalation import. Checks run on code with comments stripped (the writer/route doc-comments
// deliberately NAME the forbidden imports to explain their own absence).

const REPO_ROOT = process.cwd();
const API_ROOT = join(REPO_ROOT, "app", "api");

function walkRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkRoutes(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

function relApi(full: string): string {
  return relative(API_ROOT, full).split(sep).join("/");
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // line comments (leave http:// alone)
}

// A combined capability+space guard still proves the base auth invariant. A space-only guard does
// not: scoped routes must keep their role/capability boundary as well as the new scope boundary.
const AUTH_GUARD =
  /require(Capability(?:InSpace)?|WorkflowCommunicationContext|User|Role)\b|verifyPubSubPushRequest\b/;

const SCOPED_ROUTE_SCOPE = {
  "approval-queue/": "renewals",
  "lease-renewal/": "renewals",
  "maintenance/": "maintenance",
} as const;

// The ONLY routes allowed to run without a throwing auth guard — each a conscious decision:
//   - auth/session, auth/demo ESTABLISH a session (verify an ID token / demo flag themselves).
//   - maintenance/intake/public is the HMAC-token-gated public ingress (A5); it writes only to the
//     unverified quarantine collection via the no-actor writer.
const ALLOW_UNAUTHENTICATED = new Set([
  "auth/session/route.ts",
  "auth/demo/route.ts",
  "maintenance/intake/public/route.ts",
]);

describe("API route auth-boundary invariant", () => {
  const routes = walkRoutes(API_ROOT);

  it("enumerates the route tree (walker sanity)", () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  it("every route is authed by a throwing guard unless explicitly allow-listed", () => {
    const offenders = routes
      .map(relApi)
      .filter((relPath) => !ALLOW_UNAUTHENTICATED.has(relPath))
      .filter(
        (relPath) =>
          !AUTH_GUARD.test(stripComments(readFileSync(join(API_ROOT, relPath), "utf8"))),
      );
    expect(offenders).toEqual([]);
  });

  it("the allow-list contains no stale entries (each file still exists and is a route)", () => {
    const present = new Set(routes.map(relApi));
    for (const allowed of ALLOW_UNAUTHENTICATED) {
      expect(present.has(allowed)).toBe(true);
    }
  });

  it("every route under a scoped prefix enforces its required space without weakening base auth", () => {
    const offenders = routes.map(relApi).flatMap((relPath) => {
      if (relPath === "maintenance/intake/public/route.ts") {
        return [];
      }

      const entry = Object.entries(SCOPED_ROUTE_SCOPE).find(([prefix]) =>
        relPath.startsWith(prefix),
      );
      if (!entry) {
        return [];
      }

      const [, scope] = entry;
      const code = stripComments(readFileSync(join(API_ROOT, relPath), "utf8"));
      const scopedGuard = new RegExp(
        `require(?:SpaceAccess|CapabilityInSpace)\\([\\s\\S]{0,120}["']${scope}["']\\s*\\)`,
      );
      return scopedGuard.test(code) ? [] : [relPath];
    });

    expect(offenders).toEqual([]);
  });

  it("the public intake route imports no authed-write / session-escalation path", () => {
    const code = stripComments(
      readFileSync(join(API_ROOT, "maintenance/intake/public/route.ts"), "utf8"),
    );
    for (const forbidden of [
      "requireCapability",
      "requireUser",
      "requireRole",
      "@/lib/auth/session",
      "createMaintenanceTicket",
      "next/headers",
      "unit-matcher",
    ]) {
      expect(code).not.toContain(forbidden);
    }
    expect(/rentvine/i.test(code)).toBe(false);
  });

  it("the no-actor writer cannot reach the edit gate, a session, or a system of record", () => {
    const code = stripComments(
      readFileSync(
        join(REPO_ROOT, "lib", "firestore", "maintenance-unverified-intake.ts"),
        "utf8",
      ),
    );
    for (const forbidden of [
      "requireCapability",
      "AuthenticatedUser",
      "@/lib/auth/session",
      "createMaintenanceTicket",
      "next/headers",
      "unit-matcher",
    ]) {
      expect(code).not.toContain(forbidden);
    }
    expect(/rentvine/i.test(code)).toBe(false);
  });
});
