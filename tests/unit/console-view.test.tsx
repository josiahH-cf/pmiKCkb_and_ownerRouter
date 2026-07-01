// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The Console front door (rendered at both `/` and `/ask`). Mock the Firestore-backed process list so
// the async server component renders without touching firebase-admin.
vi.mock("@/lib/firestore/workflows", () => ({
  listProcessDefinitions: vi.fn(async () => [
    { id: "lease-renewal", name: "Lease Renewal", status: "Draft" },
  ]),
}));

import { ConsoleView } from "@/components/console/ConsoleView";
import { listProcessDefinitions } from "@/lib/firestore/workflows";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const adminUser = { uid: "u-admin", role: "Admin", email: "admin@pmikcmetro.com" };

describe("ConsoleView", () => {
  it("renders the Console front door with the grounded-answer form", async () => {
    render(await ConsoleView({ user: adminUser as never }));

    expect(
      screen.getByRole("heading", { name: "Console", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toBeInTheDocument();
  });

  it("loads process definitions for an editor so the process picker is populated", async () => {
    render(await ConsoleView({ user: adminUser as never }));

    expect(listProcessDefinitions).toHaveBeenCalledTimes(1);
    // Editors get the process picker (canStartSimulation), populated from the loaded definitions.
    expect(screen.getByLabelText("Process")).toHaveTextContent("Lease Renewal");
  });
});
