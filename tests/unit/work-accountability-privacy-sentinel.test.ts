import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { WorkMutationSchema } from "@/lib/work-accountability/schemas";

const ROOT = process.cwd();
const RUNTIME_ROOTS = [
  "app/api/work",
  "app/work",
  "app/admin/team-work",
  "components/work",
  "lib/work-accountability",
  "lib/firestore/work-accountability.ts",
] as const;

const RUNTIME_FILES = RUNTIME_ROOTS.flatMap((path) => collectFiles(join(ROOT, path)));

const PROHIBITED_RUNTIME_PATTERNS = [
  { label: "application logging", pattern: /\bconsole\.(?:log|info|warn|error)\s*\(/ },
  { label: "analytics transport", pattern: /\b(?:analytics|posthog|logEvent)\b/i },
  {
    label: "content/activity capture API",
    pattern:
      /\b(?:MediaRecorder|getUserMedia|MutationObserver|ClipboardEvent|KeyboardEvent|PointerEvent|Geolocation)\b/,
  },
  {
    label: "event-detail read",
    pattern:
      /\bevent\.(?:key|code|clientX|clientY|pageX|pageY|screenX|screenY|target|data)\b/,
  },
  { label: "DOM content read", pattern: /\.(?:textContent|innerText|innerHTML)\b/ },
  {
    label: "staff inference or employment output",
    pattern:
      /\b(?:leaderboard|productivity|performance|fastest|slowest|median-worker|quality score|effort score|discipline recommendation|termination recommendation|compensation recommendation)\b/i,
  },
  {
    label: "provider or send dependency",
    pattern:
      /from\s+["'][^"']*(?:gmail|google-drive|external-execution|action-registry|sheet-writeback|notifications\/internal|send)[^"']*["']/i,
  },
] as const;

describe("S68 privacy and zero-effect structural sentinel", () => {
  it("scans the complete S68 runtime boundary", () => {
    expect(RUNTIME_FILES.length).toBeGreaterThanOrEqual(10);
    expect(
      RUNTIME_FILES.some((path) => path.endsWith("WorkActivityController.tsx")),
    ).toBe(true);
    expect(RUNTIME_FILES.some((path) => path.endsWith("work-accountability.ts"))).toBe(
      true,
    );
  });

  it("contains no prohibited capture, inference, logging, provider, or send path", () => {
    for (const path of RUNTIME_FILES) {
      const source = readFileSync(path, "utf8");
      for (const prohibition of PROHIBITED_RUNTIME_PATTERNS) {
        expect(
          prohibition.pattern.test(source),
          `${prohibition.label}: ${rel(path)}`,
        ).toBe(false);
      }
    }
  });

  it("keeps the activity signal value-free and visible-document-only", () => {
    const source = readFileSync(
      join(ROOT, "components/work/WorkActivityController.tsx"),
      "utf8",
    );
    expect(source).toContain("const signal = () => acknowledgeVisibleActivity()");
    expect(source).toContain('document.visibilityState !== "visible"');
    expect(source).toContain('action: "heartbeat"');
    expect(source).toContain("session_id: session.id");
    expect(source).toContain("expected_version: session.record_version");
    expect(source).not.toContain('addEventListener("scroll"');
  });

  it("rejects any extra heartbeat telemetry field", () => {
    expect(
      WorkMutationSchema.safeParse({
        action: "heartbeat",
        session_id: "session-1",
        expected_version: 1,
        activity: { kind: "keyboard", value: "forbidden" },
      }).success,
    ).toBe(false);
  });

  it("rejects attempts to rewrite the employee identity during correction", () => {
    expect(
      WorkMutationSchema.safeParse({
        action: "correct_session",
        session_id: "session-1",
        expected_version: 2,
        effective_start_at: "2026-08-11T12:00:00.000Z",
        effective_end_at: "2026-08-11T12:10:00.000Z",
        staff_uid: "different-employee",
        reason: "Forbidden employee rewrite.",
        idempotency_key: "correction-1",
      }).success,
    ).toBe(false);
  });

  it("guards every S68 mutation route with the environment refusal", () => {
    for (const route of ["app/api/work/route.ts", "app/api/work/retention/route.ts"]) {
      const source = readFileSync(join(ROOT, route), "utf8");
      expect(source, route).toContain(
        "assertMutationAllowed(requireEnvironmentDescriptor())",
      );
    }
  });
});

function collectFiles(path: string): string[] {
  const status = statSync(path);
  if (status.isFile()) return [path];
  return readdirSync(path)
    .flatMap((entry) => collectFiles(join(path, entry)))
    .filter((entry) => /\.(?:ts|tsx)$/.test(entry));
}

function rel(path: string): string {
  return relative(ROOT, path).split("\\").join("/");
}
