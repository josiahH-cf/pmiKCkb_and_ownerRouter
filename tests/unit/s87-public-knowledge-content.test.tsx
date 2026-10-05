// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { VendorPortal } from "@/components/vendor/VendorPortal";
import { ProcessSummaryPanel } from "@/components/spaces/ProcessSummaryPanel";
import type { VendorTicketProjection } from "@/lib/vendor/model";
import type { ProcessDefinitionRecord } from "@/lib/firestore/types";
afterEach(cleanup);
it("the Vendor empty state retains assignment recovery and account scope without internal guessing prose", () => {
  render(<VendorPortal email="vendor@fixture.invalid" tickets={[]} />);
  expect(screen.getByRole("heading", { name: "No assigned tickets" })).toBeVisible();
  expect(screen.getByText(/Ask PMI KC to confirm/)).toBeVisible();
  expect(screen.queryByText(/Guessed or removed tickets/)).toBeNull();
  expect(screen.getByText(/Assigned-ticket threads only/)).toBeVisible();
  expect(screen.getByText(/vendor@fixture.invalid/)).toBeVisible();
});
it("the populated Vendor card retains actual ticket identity, unit, status and the original guarded destination", () => {
  const ticket = {
    id: "fixture-assigned",
    status: "Open",
    priority: "Normal",
    summary: "Fixture repair",
    unitLabel: "Fixture unit",
  } as VendorTicketProjection;
  render(<VendorPortal email="vendor@fixture.invalid" tickets={[ticket]} />);
  expect(screen.getByRole("link", { name: "Open assigned ticket" })).toHaveAttribute(
    "href",
    "/vendor/tickets/fixture-assigned",
  );
  expect(screen.getByText("Fixture unit")).toBeVisible();
  expect(screen.getByText(/Open · Normal/)).toBeVisible();
});
it("an unavailable process definition names the missing source and retains its actual recovery route", () => {
  render(
    <ProcessSummaryPanel definitionId="fixture-definition" definition={null} runs={[]} />,
  );
  expect(screen.getByText("Process definition unavailable.")).toBeVisible();
  expect(screen.queryByText(/seeded yet/)).toBeNull();
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "/processes/fixture-definition",
  );
});
it("published process source content, immutable version and run evidence remain complete", () => {
  const definition = {
    id: "fixture-definition",
    name: "Fixture process",
    status: "Active",
    short_outcome: "Approved source outcome",
    active_version_id: "fixture-version",
    steps: [{ id: "fixture-step", title: "Approved source step" }],
  } as ProcessDefinitionRecord;
  render(
    <ProcessSummaryPanel
      definitionId={definition.id}
      definition={definition}
      runs={[]}
    />,
  );
  expect(screen.getByText(definition.short_outcome)).toBeVisible();
  expect(screen.getByText("Approved source step")).toBeVisible();
  expect(screen.getByText(/fixture-version/)).toBeVisible();
  expect(screen.getByText("No workflow runs yet.")).toBeVisible();
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "/processes/fixture-definition",
  );
});
