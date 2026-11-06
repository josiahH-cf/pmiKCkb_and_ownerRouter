// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const working = vi.hoisted(() => ({
  record: null as
    | import("@/lib/lease-renewal/working-record").RenewalWorkingRecord
    | null,
  canEdit: true,
  states: {} as Record<
    string,
    import("@/components/lease-renewal/AutosaveStatus").AutosaveState
  >,
  save: vi.fn(async () => true),
}));
vi.mock("@/components/lease-renewal/RenewalWorkingRecord", () => ({
  useRenewalWorkingRecord: () => working,
}));
import { HousingAssistanceField } from "@/components/lease-renewal/RenewalHousingAssistance";

beforeEach(() => {
  working.save.mockReset().mockResolvedValue(true);
  working.states = {};
  working.canEdit = true;
  working.record = null;
});
afterEach(cleanup);

describe("Housing assistance missing-program recovery", () => {
  for (const placement of ["now", "lease-information"] as const) {
    it(`offers a keyboard retry for a failed complete save in ${placement}`, async () => {
      working.save.mockResolvedValue(false);
      const view = render(<HousingAssistanceField placement={placement} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("radio", { name: "Yes" }));
      const name = screen.getByRole("textbox", { name: "Program name" });
      await user.type(name, "Example Housing Office");
      await user.tab();
      await screen.findByText(
        "Housing assistance was not saved yet. Your entry is kept.",
      );
      working.states.housing_assistance = {
        phase: "failed",
        message: "The save did not finish.",
      };
      view.rerender(<HousingAssistanceField placement={placement} />);
      await user.tab();
      await user.tab();
      expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();
      const attemptsBeforeRetry = working.save.mock.calls.length;
      working.save.mockResolvedValue(true);
      await user.keyboard("{Enter}");
      await waitFor(() =>
        expect(working.save).toHaveBeenCalledTimes(attemptsBeforeRetry + 1),
      );
      expect(working.save).toHaveBeenLastCalledWith("housing_assistance", {
        status: "yes",
        program: "Example Housing Office",
      });
      expect(name).toHaveValue("Example Housing Office");
      expect(
        screen
          .getAllByRole("status")
          .some((element) =>
            element.textContent?.includes("Housing assistance saved for this lease."),
          ),
      ).toBe(true);
      working.states.housing_assistance = { phase: "saving" };
      view.rerender(<HousingAssistanceField placement={placement} />);
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      expect(
        screen
          .getAllByRole("status")
          .some((element) => element.textContent?.includes("Saving housing assistance")),
      ).toBe(true);
      working.canEdit = false;
      working.states.housing_assistance = {
        phase: "failed",
        message: "The save did not finish.",
      };
      view.rerender(<HousingAssistanceField placement={placement} />);
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });

    it(`marks and explains the required name, then saves when completed in ${placement}`, async () => {
      render(<HousingAssistanceField placement={placement} />);
      const user = userEvent.setup();
      expect(screen.queryByRole("textbox", { name: "Program name" })).toBeNull();
      await user.click(screen.getByRole("radio", { name: "Yes" }));
      const name = screen.getByRole("textbox", { name: "Program name" });
      expect(name).toBeRequired();
      expect(name).toHaveAttribute("aria-required", "true");
      expect(name).toHaveAccessibleDescription(/Enter the program name to save/);
      await user.click(name);
      await user.tab();
      expect(name).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Enter a program name for this lease.",
      );
      expect(working.save).not.toHaveBeenCalled();
      await user.type(name, "Example Housing Office");
      await user.tab();
      await waitFor(() =>
        expect(working.save).toHaveBeenCalledWith("housing_assistance", {
          status: "yes",
          program: "Example Housing Office",
        }),
      );
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText("Housing assistance saved for this lease.")).toBeVisible();
    });

    for (const field of [
      "Program name",
      "Program contact (optional)",
      "Notes (optional)",
    ]) {
      it(`keeps newer ${field} typing when an earlier saved record arrives in ${placement}`, async () => {
        const record = (revision: number) => ({
          schemaVersion: "renewal-working-record/v1" as const,
          leaseId: "9101",
          revision,
          fields: {
            housing_assistance: {
              value: { status: "yes" as const, program: "Example Housing Office" },
              revision,
              eventId: "synthetic-event",
              recordedAt: "2026-11-06T18:00:00.000Z",
              recordedByUid: "synthetic-editor",
              recordedByLabel: "Example Staff",
              origin: "staff_entry" as const,
            },
          },
        });
        working.record = record(1);
        const view = render(<HousingAssistanceField placement={placement} />);
        const user = userEvent.setup();
        const input = screen.getByRole("textbox", { name: field });
        const prior = (input as HTMLInputElement | HTMLTextAreaElement).value;
        await user.type(input, " newer entry");
        working.record = record(2);
        working.states.housing_assistance = { phase: "saved" };
        view.rerender(<HousingAssistanceField placement={placement} />);
        expect(input).toHaveValue(`${prior} newer entry`);
        expect(input).toHaveFocus();
        expect(screen.getByRole("status")).toHaveTextContent(
          "Unsaved housing assistance edits",
        );
        await user.tab();
        expect(working.save).toHaveBeenLastCalledWith("housing_assistance", {
          status: "yes",
          program:
            field === "Program name"
              ? "Example Housing Office newer entry"
              : "Example Housing Office",
          ...(field === "Program contact (optional)" ? { contact: "newer entry" } : {}),
          ...(field === "Notes (optional)" ? { notes: "newer entry" } : {}),
        });
      });
    }
  }
});
