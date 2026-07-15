// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReleaseStageBanner } from "@/components/layout/ReleaseStageBanner";

describe("V1 application release label", () => {
  it("makes provider status and signoffs informational", () => {
    render(<ReleaseStageBanner />);
    expect(screen.getByRole("status").textContent).toContain("V1 application");
    expect(screen.getByRole("status").textContent).toContain(
      "Live and Test records are clearly labeled",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "provider status and signoffs are advisory",
    );
  });
});
