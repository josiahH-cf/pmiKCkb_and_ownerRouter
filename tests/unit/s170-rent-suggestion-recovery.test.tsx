// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  RentSuggestionApproval,
  type RentSuggestionData,
} from "@/components/lease-renewal/RentSuggestionApproval";
import { SupportReportStatusControl } from "@/components/admin/SupportReportStatusControl";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const data: RentSuggestionData = {
  suggestion: {
    suggestedRent: 2400,
    status: "suggested",
    comps: [{ rent: 2400, source: "Local verified comp" }],
    rationale: "Local fixture rationale",
  },
  approval: null,
  canApprove: true,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("terminates a failed initial owning read and recovers through a deliberate GET", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: "Source unavailable" }, { status: 503 }),
    )
    .mockResolvedValueOnce(Response.json(data));
  vi.stubGlobal("fetch", request);
  render(<RentSuggestionApproval leaseId="fixture-one" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
  expect(screen.queryByText("Loading the comp-derived suggestion…")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry current suggestion" }));
  await screen.findByText("Local verified comp");
  expect(request).toHaveBeenCalledTimes(2);
  expect(
    request.mock.calls.every(([, init]) => !init?.method || init.method === "GET"),
  ).toBe(true);
});

it("bounds a stalled owning read without fabricating an empty suggestion", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  render(<RentSuggestionApproval leaseId="fixture-stalled" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_001);
  });
  expect(screen.getByRole("alert")).toHaveTextContent(/unavailable|did not finish/i);
  expect(screen.getByRole("button", { name: "Retry current suggestion" })).toBeEnabled();
  expect(screen.queryByText("No comp-derived suggestion available.")).toBeNull();
});

it("ignores a superseded record read through the actual owning component", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown) =>
      String(url).includes("fixture-old")
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(
            Response.json({
              ...data,
              suggestion: { ...data.suggestion, rationale: "Current record rationale" },
            }),
          ),
    ),
  );
  const mounted = render(<RentSuggestionApproval leaseId="fixture-old" />);
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  mounted.rerender(<RentSuggestionApproval leaseId="fixture-current" />);
  await screen.findByText("Current record rationale");
  await act(async () => finish(Response.json(data)));
  expect(screen.getByText("Current record rationale")).toBeVisible();
  expect(screen.queryByText("Local fixture rationale")).toBeNull();
});

it("retains an uncertain decision and its reason instead of permitting another POST", async () => {
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") throw new TypeError("Local lost response fixture");
    return Response.json(data);
  });
  vi.stubGlobal("fetch", request);
  render(<RentSuggestionApproval leaseId="fixture-one" initialData={data} />);
  fireEvent.change(screen.getByRole("textbox", { name: /Reason/ }), {
    target: { value: "Keep the reviewed reason" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve this number" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed/i);
  expect(screen.getByRole("textbox", { name: /Reason/ })).toHaveValue(
    "Keep the reviewed reason",
  );
  expect(screen.getByRole("button", { name: "Approve this number" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Check current suggestion" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Approve this number" }));
  expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(
    1,
  );
});

it("does not admit an older response body after a different lease is selected", async () => {
  let finish!: (value: RentSuggestionData) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) =>
      String(url).includes("fixture-old")
        ? ({
            ok: true,
            json: () =>
              new Promise<RentSuggestionData>((resolve) => {
                finish = resolve;
              }),
          } as unknown as Response)
        : Response.json({
            ...data,
            suggestion: { ...data.suggestion, rationale: "Current body rationale" },
          }),
    ),
  );
  const mounted = render(<RentSuggestionApproval leaseId="fixture-old" />);
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  mounted.rerender(<RentSuggestionApproval leaseId="fixture-current" />);
  await screen.findByText("Current body rationale");
  await act(async () => finish(data));
  expect(screen.getByText("Current body rationale")).toBeVisible();
  expect(screen.queryByText("Local fixture rationale")).toBeNull();
});

it("keeps an uncertain feedback status separate from failure and prevents blind repeat transitions", async () => {
  const request = vi.fn(async () => {
    throw new TypeError("Local lost response fixture");
  });
  vi.stubGlobal("fetch", request);
  render(<SupportReportStatusControl reportId="fixture-report" status="new" />);
  const note = screen.getByRole("textbox", {
    name: "Optional note recorded on the status change",
  });
  fireEvent.change(note, { target: { value: "Retain the pending audit note" } });
  fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed/i);
  expect(note).toHaveValue("Retain the pending audit note");
  expect(screen.getByRole("button", { name: "Resolve" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "Reload current feedback" })).toHaveAttribute(
    "href",
    "/admin",
  );
});

it("treats a server error after feedback dispatch as an uncertain status rather than a repeatable refusal", async () => {
  const request = vi.fn(async () =>
    Response.json({ error: "Readback unavailable" }, { status: 500 }),
  );
  vi.stubGlobal("fetch", request);
  render(<SupportReportStatusControl reportId="fixture-report" status="new" />);
  const note = screen.getByRole("textbox", {
    name: "Optional note recorded on the status change",
  });
  fireEvent.change(note, { target: { value: "Retain the pending audit note" } });
  fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed/i);
  expect(note).toHaveValue("Retain the pending audit note");
  expect(screen.getByRole("button", { name: "Resolve" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "Reload current feedback" })).toHaveAttribute(
    "href",
    "/admin",
  );
});
