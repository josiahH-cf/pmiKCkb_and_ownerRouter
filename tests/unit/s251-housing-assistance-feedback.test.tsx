// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const working = vi.hoisted(() => ({
  record: null,
  canEdit: true,
  states: {},
  save: vi.fn(async () => true),
}));
vi.mock("@/components/lease-renewal/RenewalWorkingRecord", () => ({
  useRenewalWorkingRecord: () => working,
}));
import { HousingAssistanceField } from "@/components/lease-renewal/RenewalHousingAssistance";

beforeEach(() => working.save.mockClear());
afterEach(cleanup);

describe("Housing assistance missing-program recovery", () => {
  for (const placement of ["now", "lease-information"] as const) {
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
      expect(screen.getByRole("status")).toHaveTextContent(
        "Housing assistance saved for this lease.",
      );
    });
  }
});
