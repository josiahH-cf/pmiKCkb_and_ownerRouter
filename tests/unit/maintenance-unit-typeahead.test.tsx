// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnitTypeahead } from "@/components/maintenance/UnitTypeahead";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UnitTypeahead", () => {
  it("queries the search endpoint and calls onSelect with the picked unit", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/api/maintenance/units/search")
          ? Response.json({
              units: [{ unitId: "unit:456", label: "123 Main Street Unit 2" }],
            })
          : Response.json({}),
      ),
    );
    const onSelect = vi.fn();
    render(<UnitTypeahead id="t" onSelect={onSelect} />);

    await user.type(screen.getByLabelText("Unit / location"), "123 Main");
    await user.click(
      await screen.findByRole("button", { name: /123 Main Street Unit 2/ }),
    );

    expect(onSelect).toHaveBeenLastCalledWith({
      unitId: "unit:456",
      label: "123 Main Street Unit 2",
    });
    expect(screen.getByLabelText("Unit / location")).toHaveValue(
      "123 Main Street Unit 2",
    );
  });

  it("degrades non-fatally when the lookup is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const onSelect = vi.fn();
    render(<UnitTypeahead id="t" onSelect={onSelect} />);

    await user.type(screen.getByLabelText("Unit / location"), "123 Main");
    expect(await screen.findByText(/Unit lookup is unavailable/)).toBeInTheDocument();
  });
});
