// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReleaseStageBanner } from "@/components/layout/ReleaseStageBanner";

describe("pre-V1 release label", () => {
  it("never renders an unqualified V1 success label", () => {
    render(<ReleaseStageBanner />);
    expect(screen.getByRole("status").textContent).toContain("Pre-V1 candidate");
    expect(screen.getByRole("status").textContent).toContain("remain individually gated");
  });
});
