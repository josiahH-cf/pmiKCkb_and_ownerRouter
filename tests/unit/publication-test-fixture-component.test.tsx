// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrustedPublicationTestFixturePanel } from "@/components/spaces/TrustedPublicationTestFixturePanel";
import { TEST_PUBLICATION_CONFIRMATIONS } from "@/lib/publication/test-fixture-contract";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TrustedPublicationTestFixturePanel", () => {
  it("shows the boundary and exercises exact revision plus rollback confirmations", async () => {
    const user = userEvent.setup();
    let postCount = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return json({ fixture: status("ready", "baseline", 1) });
      postCount += 1;
      const nextStatus =
        postCount === 1
          ? status("revision_active", "revision", 2)
          : postCount === 2
            ? status("ready", "baseline", 3)
            : {
                ...status("ready", "baseline", 3),
                continuation_ready: true,
                pinned_process_definition_version_id: "process-version-1",
                pinned_test_run_id: "publication_test_run_1",
              };
      return json({
        result: {
          changed: true,
          effect:
            postCount === 1 ? "published" : postCount === 2 ? "rolled_back" : "continued",
          status: nextStatus,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TrustedPublicationTestFixturePanel spaceId="lease-renewals" />);
    await user.click(screen.getByText("Trusted publication Test fixture"));
    expect(screen.getByText(/hash-locked fixture revisions/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not claim a Live malware scanner/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Inspect Test publication fixture" }),
    );
    expect(await screen.findByText("TEST · never Live evidence")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Publish exact Test revision" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("revision_active"),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      confirmation: TEST_PUBLICATION_CONFIRMATIONS.publishRevision,
      operation: "publish_revision",
    });

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Roll back Test baseline" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("active state is ready"),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      confirmation: TEST_PUBLICATION_CONFIRMATIONS.rollbackBaseline,
      operation: "rollback_baseline",
    });

    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Start version-pinned Test run" }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({
      confirmation: TEST_PUBLICATION_CONFIRMATIONS.continuePinnedRun,
      operation: "continue_pinned_run",
    });
    expect(
      await screen.findByRole("link", { name: "publication_test_run_1" }),
    ).toHaveAttribute("href", "/workflow-runs/publication_test_run_1");
  });
});

function status(
  state: "ready" | "revision_active",
  activeRevision: "baseline" | "revision",
  versionNumber: number,
) {
  return {
    active_revision: activeRevision,
    active_version_id: `version-${versionNumber}`,
    active_version_number: versionNumber,
    authority: "repository-owned exact Test fixture contract",
    baseline_version_id: "version-1",
    capture_task_id: "capture-1",
    capture_task_status: "resolved",
    continuation_ready: false,
    data_mode: "test",
    live_evidence_eligible: false,
    policy_ready: true,
    rollback_available: true,
    scanner_boundary: "exact-hash-only; no Live scanner claim",
    state,
    pinned_process_definition_version_id: null,
    pinned_publication_version_id: `version-${versionNumber}`,
    pinned_test_run_id: null,
    version_count: versionNumber,
  };
}

function json(payload: unknown) {
  return Response.json(payload);
}
