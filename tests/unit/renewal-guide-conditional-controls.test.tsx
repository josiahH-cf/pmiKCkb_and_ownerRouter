// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LeaseTermReviewControl } from "@/components/lease-renewal/LeaseTermReviewControl";
import { RenewalOwnerOutcomeControl } from "@/components/lease-renewal/RenewalOwnerOutcomeControl";
import {
  OwnerDecisionForm,
  RenewalCompleteButton,
} from "@/components/lease-renewal/RenewalProgressControls";
import { fixedTermProjection } from "@/tests/helpers/lease-term-fixtures";

// Testing Library matches a string accessible name exactly; Playwright's `exact` option is not part of this API.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the exact term-review control only with edit authority and keeps missing evidence disabled", () => {
  const props = {
    leaseId: "fixture-lease",
    term: fixedTermProjection(),
    recordedTerm: null,
  };
  const view = render(<LeaseTermReviewControl {...props} canEdit={false} />);
  expect(screen.queryByRole("button", { name: "Record lease term" })).toBeNull();
  view.rerender(<LeaseTermReviewControl {...props} canEdit />);
  expect(screen.getByRole("button", { name: "Record lease term" })).toBeDisabled();
});

it("shows the exact owner-response control without treating absent evidence as permission", () => {
  render(<RenewalOwnerOutcomeControl current={null} leaseId="fixture-lease" />);
  expect(screen.getByRole("button", { name: "Record owner response" })).toBeDisabled();
});

it("keeps a refused completion visible as incomplete and removes the control only for a completed record", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Required evidence is missing." }),
    })),
  );
  const view = render(<RenewalCompleteButton leaseId="fixture-lease" complete={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Mark renewal complete" }));
  await waitFor(() =>
    expect(screen.getByText("Required evidence is missing.")).toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "Mark renewal complete" })).toBeEnabled();
  expect(screen.queryByText("✓ Renewal marked complete.")).toBeNull();
  view.rerender(<RenewalCompleteButton leaseId="fixture-lease" complete />);
  expect(screen.queryByRole("button", { name: "Mark renewal complete" })).toBeNull();
});

it("names the correction of an existing owner decision explicitly", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ status: "not_found" }) })),
  );
  render(
    <OwnerDecisionForm
      leaseId="fixture-lease"
      current={{ decision: "increase", offeredRent: 1 }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Update owner decision" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Record owner decision" })).toBeNull();
});
