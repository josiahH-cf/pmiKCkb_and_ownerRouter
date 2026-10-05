// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { StartRunButton } from "@/components/console/StartRunButton";
import { OperationWaitError, waitFailureMessage } from "@/lib/ui/fetch-lifetime";

// S169: when local waiting ends without a response, the request may still have been carried out.
// A control that changes something therefore keeps the unknown-outcome wording and never reports a
// definite failure for an elapsed wait. A request that could not be made keeps its own message.

const UNKNOWN = /The response did not arrive\. The outcome is unknown/;

describe("S169 an elapsed wait keeps its unknown-outcome wording", () => {
  it("returns the wait's own message and leaves other failures to the caller's wording", () => {
    expect(waitFailureMessage(new OperationWaitError(false), "Could not save.")).toMatch(
      UNKNOWN,
    );
    expect(waitFailureMessage(new OperationWaitError(true), "Could not save.")).toBe(
      "This read did not finish. Retry when ready.",
    );
    expect(waitFailureMessage(new TypeError("Failed to fetch"), "Could not save.")).toBe(
      "Could not save.",
    );
    expect(waitFailureMessage(undefined, "Could not save.")).toBe("Could not save.");
  });

  describe("starting a run", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("says the outcome is unknown when the response never arrives", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise<Response>(() => undefined)),
      );
      render(<StartRunButton fallbackHref="/spaces/one" processDefinitionId="p1" />);
      fireEvent.click(screen.getByRole("button", { name: "Start run" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(screen.getByText(UNKNOWN)).toBeInTheDocument();
      expect(screen.queryByText(/Run could not be started/)).toBeNull();
    });

    it("keeps its own wording when the request could not be made", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
      );
      render(<StartRunButton fallbackHref="/spaces/one" processDefinitionId="p1" />);
      fireEvent.click(screen.getByRole("button", { name: "Start run" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(
        screen.getByText("Run could not be started. Try again or open the Space."),
      ).toBeInTheDocument();
      expect(screen.queryByText(UNKNOWN)).toBeNull();
    });
  });

  it("leaves no reviewed control reporting a definite failure from a bare catch after a write", () => {
    // Each control below changes a record or starts work. Its catch after the write must read the
    // error so an elapsed wait is told apart from a request that could not be made.
    const reviewed = [
      "components/admin/AccessCenter.tsx",
      "components/admin/KbCorrectionsPanel.tsx",
      "components/admin/MoveOutTimingBasisAdminPanel.tsx",
      "components/admin/NoticeRulesAdminPanel.tsx",
      "components/admin/OwnerPolicyRulesAdminPanel.tsx",
      "components/admin/ReindexPanel.tsx",
      "components/admin/SpaceRequestPanel.tsx",
      "components/admin/TransactionalDestinationPanel.tsx",
      "components/admin/UserManagementPanel.tsx",
      "components/ask/DashboardTurnView.tsx",
      "components/console/StartRunButton.tsx",
      "components/desk/SpaceDeskRunPanel.tsx",
      "components/lease-renewal/flag-actions.tsx",
      "components/lease-renewal/RenewalDecider.tsx",
      "components/lease-renewal/RenewalOwnerOutcomeControl.tsx",
      "components/lease-renewal/RenewalTenantOutcomeControl.tsx",
      "components/lease-renewal/RenewalProgressControls.tsx",
      "components/maintenance/MaintenanceCapture.tsx",
      "components/maintenance/MaintenanceOwnerNoticeDraftComposer.tsx",
      "components/maintenance/MaintenanceQueue.tsx",
      "components/maintenance/UnverifiedIntakeReview.tsx",
    ];
    const messages = [
      "The request could not be cancelled.",
      "Could not reach the corrections service.",
      "Could not record the notice timing basis.",
      "Could not save the notice rules.",
      "Could not reach the rules service.",
      "Could not reach the re-index service.",
      "Could not reach the Space request service.",
      "Could not reach the exact Space pilot service.",
      "Could not save the destination address.",
      "Could not reach the user service. Try again.",
      "Capture failed.",
      "Could not file the correction.",
      "Run could not be started. Try again or open the Space.",
      "Could not reach the run endpoint.",
      "Could not reach the step-checks endpoint.",
      "Could not reach the resolution endpoint.",
      "Could not reach the approval endpoint.",
      "Skip could not be saved. This item is still in your list.",
      "Could not reach the renewal service.",
      "Could not reach the screenshot service.",
      "Could not reach the screenshot removal service.",
      "Could not reach the ticket service.",
      "Could not reach the draft service. Your wording is unchanged.",
      "Could not reach the intake service. Try again.",
    ];
    const offenders: string[] = [];
    for (const file of reviewed) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).toContain("waitFailureMessage");
      for (const message of messages) {
        let from = 0;
        for (;;) {
          const at = source.indexOf(`"${message}"`, from);
          if (at < 0) break;
          from = at + 1;
          const lead = source.slice(Math.max(0, at - 160), at);
          // Only the catch after a request is in scope; a refusal read from the response is not.
          if (!/\}\s*catch\s*(\(\w+\))?\s*\{[^}]*$/.test(lead)) continue;
          if (!/waitFailureMessage\(\s*error,\s*(readError\(null,\s*)?$/.test(lead))
            offenders.push(`${file}: ${message}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// S87/S176: a text field's meaning stays visible after a value replaces its placeholder.
describe("S87 a placeholder is never a field's only visible label", () => {
  function sources(directory: string, found: string[] = []) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) sources(path, found);
      else if (name.endsWith(".tsx")) found.push(path);
    }
    return found;
  }
  function tagEnd(text: string, start: number) {
    let depth = 0;
    let quote = "";
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0 && text[index - 1] !== "=") return index;
    }
    return -1;
  }

  it(
    "finds a visible label for every text control that shows a placeholder",
    { timeout: 120_000 },
    () => {
      const root = process.cwd();
      const unlabeled: string[] = [];
      for (const top of ["app", "components"]) {
        for (const path of sources(join(root, top))) {
          const text = readFileSync(path, "utf8");
          for (const match of text.matchAll(/<(input|textarea)\b/g)) {
            const start = match.index ?? 0;
            const tag = text.slice(start, tagEnd(text, start) + 1);
            if (!tag.includes("placeholder=")) continue;
            if (/type="(hidden|checkbox|radio|file|submit)"/.test(tag)) continue;
            const before = text.slice(Math.max(0, start - 900), start);
            const wrapped =
              before.lastIndexOf("<label") > before.lastIndexOf("</label>") ||
              Math.max(before.lastIndexOf("<Field"), before.lastIndexOf("<FormField")) >
                Math.max(
                  before.lastIndexOf("</Field>"),
                  before.lastIndexOf("</FormField>"),
                );
            const id = /\bid=(\{[^}]+\}|"[^"]+")/.exec(tag)?.[1];
            const referenced = Boolean(id && text.includes(`htmlFor=${id}`));
            if (!wrapped && !referenced)
              unlabeled.push(
                `${relative(root, path).replaceAll("\\", "/")}:${text.slice(0, start).split("\n").length}`,
              );
          }
        }
      }
      expect(unlabeled).toEqual([]);
    },
  );
});
