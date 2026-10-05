// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenewalWorkspaceSidebars } from "@/components/lease-renewal/RenewalWorkspaceSidebars";
afterEach(cleanup);
describe("S174 real lease inspector", () => {
  it("opens a non-modal inspector with a named keyboard resizing separator and retains edits", () => {
    const reads = vi.fn();
    function Information() {
      reads();
      return <p>Current source facts</p>;
    }
    render(
      <RenewalWorkspaceSidebars
        identity="7001 Sample St"
        leaseInformation={<Information />}
      >
        <label>
          Working note
          <input defaultValue="Keep this" />
        </label>
      </RenewalWorkspaceSidebars>,
    );
    expect(reads).not.toHaveBeenCalled();
    const toggle = screen.getByRole("button", { name: "Lease information" });
    fireEvent.click(toggle);
    const inspector = screen.getByRole("complementary", { name: "Lease information" });
    expect(inspector).not.toHaveAttribute("aria-modal");
    const separator = screen.getByRole("separator", { name: "Resize lease information" });
    const before = Number(separator.getAttribute("aria-valuenow"));
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(Number(separator.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
    expect(screen.getByRole("textbox", { name: "Working note" })).toHaveValue(
      "Keep this",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close lease information" }));
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole("separator")).toBeNull();
  });
});
