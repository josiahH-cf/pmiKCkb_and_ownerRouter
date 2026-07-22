// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import VendorLayout from "@/app/vendor/layout";

describe("Vendor layout", () => {
  it("renders vendor routes without the removed V1 environment banner", () => {
    render(
      <VendorLayout>
        <main>Invented Vendor fixture</main>
      </VendorLayout>,
    );

    expect(screen.getByText("Invented Vendor fixture")).toBeTruthy();
    // The advisory "V1 application …" environment banner was removed from the app topline.
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.body.textContent).not.toContain("V1 application");
  });
});
