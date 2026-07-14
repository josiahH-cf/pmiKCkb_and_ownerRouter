// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleLiveDataPanel } from "@/components/console/ConsoleLiveDataPanel";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  loadConsoleProjection,
  type ConsoleDataProvider,
  type ConsoleOperationalRow,
} from "@/lib/console/live-data";

const observedAt = "2026-07-14T12:00:00.000Z";

afterEach(cleanup);

describe("Console live-data projection", () => {
  it("renders provenance and exact bounded metadata while omitting the wrong Space", async () => {
    const provider = providerWithRows([row("lease-renewals"), row("maintenance")]);
    const actor: AuthenticatedUser = {
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["renewals"],
      uid: "editor-1",
    };
    const projection = await loadConsoleProjection(
      actor,
      { kind: "live" },
      {
        createLive: () => provider,
        createTest: vi.fn(),
      },
    );
    expect(projection.rows).toHaveLength(1);

    render(<ConsoleLiveDataPanel projection={projection} />);
    expect(screen.getByText("Fixture property lease-renewals")).toBeInTheDocument();
    expect(screen.queryByText("Fixture property maintenance")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Rentvine · fresh · observed/)).toHaveLength(2);
    expect(screen.getByText(/From fixture-sender@example\.test to/)).toBeInTheDocument();
    expect(screen.getByText("Synthetic test communication")).toBeInTheDocument();
    expect(screen.getByText("Synthetic bounded preview")).toBeInTheDocument();
  });

  it("serializes no body, attachment, or unrelated message identifier", async () => {
    const projection = await loadConsoleProjection(
      admin(),
      { kind: "live" },
      {
        createLive: () => providerWithRows([row("lease-renewals")]),
        createTest: vi.fn(),
      },
    );
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toMatch(/bodyText|attachments|gmail_thread_id|messageId/);
    expect(serialized).not.toContain("fixture full body must never serialize");
  });
});

function providerWithRows(rows: ConsoleOperationalRow[]): ConsoleDataProvider {
  return {
    async load() {
      return { rows, sourceHealth: [] };
    },
  };
}

function row(spaceId: string): ConsoleOperationalRow {
  return {
    currentRent: field("Rentvine", "$1,250"),
    leaseEnd: field("Rentvine", "2026-08-31"),
    message: field("Gmail", {
      observedAt,
      recipients: ["fixture-recipient@example.test"],
      sender: "fixture-sender@example.test",
      snippet: "Synthetic bounded preview",
      subject: "Synthetic test communication",
      timestamp: observedAt,
    }),
    property: field("Rentvine", `Fixture property ${spaceId}`),
    rowKey: `row-${spaceId}`,
    spaceId,
    tenant: field("Rentvine", "Fixture household"),
    workflow: field("PMI KC workflow", "Fixture workflow"),
    workflowHref: spaceId === "lease-renewals" ? "/lease-renewal" : "/maintenance",
  };
}

function field<T>(source: "Rentvine" | "PMI KC workflow" | "Gmail", value: T) {
  return { observedAt, source, state: "fresh" as const, value };
}

function admin(): AuthenticatedUser {
  return {
    email: "admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin",
    uid: "admin-1",
  };
}
