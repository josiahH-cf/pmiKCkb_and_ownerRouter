import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ASK_MODEL_RATE_LIMIT_OPTIONS,
  askModelRateLimiter,
  CLASSIFY_MODEL_RATE_LIMIT_OPTIONS,
  classifyModelRateLimiter,
} from "@/lib/api/model-call-throttle";
import type { IntakeRateLimiter } from "@/lib/maintenance/intake-rate-limit";

interface DocumentedThrottle {
  capacity: number;
  refillPerSecond: number;
}

const POLICY_PATH = join(process.cwd(), "docs/budget-and-cost-policy.md");
const policy = readFileSync(POLICY_PATH, "utf8");
const normalizedPolicy = policy.replace(/\s+/g, " ");

function readDocumentedThrottle(route: string): DocumentedThrottle {
  const row = policy
    .split(/\r?\n/)
    .find((line) => /^\|\s*3\s*\|/.test(line) && line.includes(`\`${route}\``));
  if (!row) throw new Error(`Missing layer-3 policy row for ${route}`);

  const routeContract = row.slice(row.indexOf(`\`${route}\``));
  const match = routeContract?.match(
    /capacity `(?<capacity>\d+)`, refill `(?<refill>\d+(?:\.\d+)?) token\/s`/,
  );
  if (!match?.groups) {
    throw new Error(`Malformed documented throttle for ${route}`);
  }

  return {
    capacity: Number(match.groups.capacity),
    refillPerSecond: Number(match.groups.refill),
  };
}

function verifyRuntimeBehavior(
  limiter: IntakeRateLimiter,
  { capacity, refillPerSecond }: DocumentedThrottle,
) {
  const uid = "policy-user";
  const now = 1_000_000;

  limiter.reset();
  for (let attempt = 0; attempt < capacity; attempt += 1) {
    expect(limiter.check(uid, now).allowed).toBe(true);
  }
  expect(limiter.check(uid, now).allowed).toBe(false);
  expect(limiter.check("independent-user", now).allowed).toBe(true);

  const refillMs = 1_000 / refillPerSecond;
  limiter.reset();
  for (let attempt = 0; attempt < capacity; attempt += 1) {
    limiter.check(uid, now);
  }
  expect(limiter.check(uid, now + refillMs - 1).allowed).toBe(false);

  limiter.reset();
  for (let attempt = 0; attempt < capacity; attempt += 1) {
    limiter.check(uid, now);
  }
  expect(limiter.check(uid, now + refillMs).allowed).toBe(true);
}

describe("S52-J paid-model throttle policy", () => {
  it.each([
    {
      route: "/api/ask",
      expected: { capacity: 15, refillPerSecond: 0.5 },
      options: ASK_MODEL_RATE_LIMIT_OPTIONS,
      limiter: askModelRateLimiter,
    },
    {
      route: "/api/processes/classify",
      expected: { capacity: 10, refillPerSecond: 0.2 },
      options: CLASSIFY_MODEL_RATE_LIMIT_OPTIONS,
      limiter: classifyModelRateLimiter,
    },
  ])("keeps $route documentation and runtime behavior in lockstep", (entry) => {
    const documented = readDocumentedThrottle(entry.route);

    expect(documented).toEqual(entry.expected);
    expect(entry.options).toMatchObject(entry.expected);
    verifyRuntimeBehavior(entry.limiter, documented);
  });

  it("keeps the third layer distinct from posture checks and global enforcement", () => {
    expect(policy).toContain("## Three-layer cost-control model");
    expect(normalizedPolicy).toContain(
      "It does not read spend and is not a dollar-enforcement point.",
    );
    expect(normalizedPolicy).toContain(
      "It bounds total project spend, not one user's call rate.",
    );
    expect(normalizedPolicy).toContain(
      "best-effort, in-memory, per-instance burst controls",
    );
    expect(normalizedPolicy).toContain("they do not make a billed model call eligible");
  });
});
