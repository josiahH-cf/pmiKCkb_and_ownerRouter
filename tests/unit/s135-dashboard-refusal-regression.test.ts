import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  conversationActorKey,
  runAssistantConversation,
} from "@/lib/assistant/conversation";
import {
  approvalsRead,
  connectionsRead,
  fakeOperationalContext,
  renewalsRead,
  workRead,
} from "@/tests/helpers/operational-context-fake";

// S135: the reported "no information" refusal. Traced cause: the Dashboard sent every question to a
// closed three-intent registry; anything else got "The assistant answers three questions right now"
// and fell through to the knowledge-only answer, which returns "No approved PMI KC source is
// configured for this question" when no approved document matches, even when the user's own records
// answer it. These checks exercise that path and keep the removed gate from coming back.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("S135 ordinary operational questions reach the user's records", () => {
  it.each([
    ["What does my approval queue look like?", "approvals"],
    ["What applications are connected?", "connections"],
    ["What leases are due this week?", "renewals"],
    ["Which leases are assigned to me?", "renewals"],
    ["What information is stale and needs updating?", "connections"],
  ])("%s", async (question, source) => {
    const context = fakeOperationalContext({
      reads: {
        approvals: approvalsRead([{ key: "a1", canApproveNow: true }]),
        connections: connectionsRead([{ id: "rentvine", state: "connected" }]),
        renewals: renewalsRead([{ id: "L1", endDateIso: "2026-10-01" }]),
        work: workRead([]),
      },
    });
    const answer = await runAssistantConversation(
      { question },
      {
        nowIso: context.nowIso,
        actorKey: conversationActorKey(context.actorUid),
        context,
        interpret: null,
      },
    );
    expect(answer.kind).toBe("answer");
    expect(answer.knowledgeQuestion).toBeNull();
    expect(answer.groups[0].source).toBe(source);
    expect(JSON.stringify(answer)).not.toMatch(
      /No approved PMI KC source|three questions/,
    );
  });
});

describe("S135 the removed gate stays removed", () => {
  it("retires the closed three-intent registry and its bounded refusal note", () => {
    expect(existsSync("lib/assistant/intent-registry.ts")).toBe(false);
    expect(existsSync("lib/assistant/query.ts")).toBe(false);
    for (const path of sourceFiles(["app", "components", "lib"])) {
      const code = readFileSync(path, "utf8");
      expect(code, path).not.toContain("answers three questions right now");
      expect(code, path).not.toContain("ASSISTANT_SUPPORTED_QUESTIONS");
    }
  });

  it("needs only the read capability every signed-in role holds, with no AI-specific gate", () => {
    const route = readFileSync("app/api/assistant/query/route.ts", "utf8").replaceAll(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    expect(route).toContain('requireCapability("read")');
    expect(route).not.toMatch(/requireCapability\("(edit|approve|manageAdmin)"\)/);
    expect(route).not.toMatch(
      /action-gate|actionKey|production_allowed|requireSpaceAccess/,
    );
    const roles = readFileSync("lib/auth/roles.ts", "utf8");
    for (const role of ["Editor", "Approver"])
      expect(roles).toMatch(new RegExp(`${role}: new Set\\(\\[\\s*"read"`));
  });

  it("sends a throttled or failed model interpretation to the deterministic interpreter, never a refusal", () => {
    const route = readFileSync("app/api/assistant/query/route.ts", "utf8");
    expect(route).toContain("assistantModelRateLimiter.check(user.uid");
    expect(route).not.toMatch(/status:\s*429/);
  });
});

function sourceFiles(roots: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  };
  for (const root of roots) walk(join(process.cwd(), root));
  return out;
}
