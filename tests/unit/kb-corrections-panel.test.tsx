// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KbCorrectionsPanel } from "@/components/admin/KbCorrectionsPanel";
import type { AskCorrectionRecord } from "@/lib/firestore/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const PROPOSED: AskCorrectionRecord = {
  id: "corr-1",
  ask_log_id: "log-1",
  space_id: "kb",
  question: "What is the late-fee grace period?",
  kind: "wrong_fact",
  note: "The grace period is 5 days, not 3.",
  source_state: "Verified",
  citations: [],
  status: "Proposed",
  user_uid: "editor-1",
  created_at: "2026-07-23T00:00:00.000Z",
  updated_at: "2026-07-23T00:00:00.000Z",
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(
    async () => ({ ok: true, json: async () => ({}) }) as unknown as Response,
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("KbCorrectionsPanel (AC-S32-3)", () => {
  it("lists Proposed corrections with Approve / Dismiss controls", () => {
    render(<KbCorrectionsPanel proposed={[PROPOSED]} />);
    expect(screen.getByText("What is the late-fee grace period?")).toBeInTheDocument();
    expect(screen.getByText("The grace period is 5 days, not 3.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dismiss/ })).toBeInTheDocument();
  });

  it("Approve posts the decision to the correction route (files a Draft, never an active entry)", async () => {
    const user = userEvent.setup();
    render(<KbCorrectionsPanel proposed={[PROPOSED]} />);
    await user.click(screen.getByRole("button", { name: /Approve/ }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/ask/corrections/corr-1");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      decision: "approve",
    });
  });

  it("shows an empty state when nothing is waiting for review", () => {
    render(<KbCorrectionsPanel proposed={[]} />);
    expect(screen.getByText(/No corrections are waiting/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  });
});
