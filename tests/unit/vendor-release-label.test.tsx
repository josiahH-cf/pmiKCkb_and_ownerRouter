// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import VendorLayout from "@/app/vendor/layout";

describe("Vendor pre-V1 release label", () => {
  it("wraps every Vendor route in the release-stage banner", () => {
    render(
      <VendorLayout>
        <main>Invented Vendor fixture</main>
      </VendorLayout>,
    );

    expect(screen.getByRole("status").textContent).toContain("Pre-V1 candidate");
    expect(screen.getByText("Invented Vendor fixture")).toBeTruthy();
  });
});
