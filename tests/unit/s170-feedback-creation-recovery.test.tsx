// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReportIssueButton } from "@/components/feedback/ReportIssueButton";
import { ErrorReportPanel } from "@/components/feedback/ErrorReportPanel";

vi.mock("next/navigation", () => ({ usePathname: () => "/console" }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const unknownResponses = ["lost response", "server error", "lost response body"] as const;
function unknown(mode: (typeof unknownResponses)[number]) {
  if (mode === "lost response") return Promise.reject(new TypeError("offline"));
  if (mode === "server error")
    return Promise.resolve(
      new Response(JSON.stringify({ error: "Local failure" }), { status: 500 }),
    );
  return Promise.resolve({
    ok: true,
    status: 202,
    json: () => Promise.reject(new TypeError("body lost")),
  } as Response);
}

it.each(unknownResponses)(
  "retains typed feedback and fences %s across closing and reopening",
  async (mode) => {
    const fetch = vi.fn(() => unknown(mode));
    vi.stubGlobal("fetch", fetch);
    render(<ReportIssueButton />);
    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    const input = screen.getByRole("textbox", { name: /Your feedback/ });
    fireEvent.change(input, { target: { value: "Keep this local review" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByRole("alert", { name: "" });
    expect(screen.getByRole("alert")).toHaveTextContent(/not confirmed/);
    expect(input).toHaveValue("Keep this local review");
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    expect(screen.getByRole("textbox", { name: /Your feedback/ })).toHaveValue(
      "Keep this local review",
    );
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it.each(unknownResponses)(
  "keeps page recovery available while fencing a crash report with %s",
  async (mode) => {
    const fetch = vi.fn(() => unknown(mode)),
      reset = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<ErrorReportPanel error={new Error("Local render failure")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Report this problem" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed/);
    expect(screen.getByRole("button", { name: "Report this problem" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Report this problem" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  },
);

it("does not submit a second report after a durable receipt whose notification is still pending", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ received: true, delivered: false }), { status: 202 }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<ReportIssueButton />);
  fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
  fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled(),
  );
  expect(
    await screen.findByText(/received/, { selector: '[role="status"]' }),
  ).toBeVisible();
  expect(screen.queryByText(/try again in a moment/i)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("prevents an immediate double dispatch while a feedback request is pending, preserving text after dialog exit", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<ReportIssueButton />);
  fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Your feedback/ }), {
    target: { value: "Pending local description" },
  });
  const button = screen.getByRole("button", { name: "Send feedback" });
  act(() => {
    button.click();
    button.click();
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
  expect(screen.getByRole("textbox", { name: /Your feedback/ })).toHaveValue(
    "Pending local description",
  );
  expect(screen.getByRole("button", { name: "Sending" })).toBeDisabled();
  await act(async () => {
    finish(
      new Response(JSON.stringify({ received: true, delivered: true }), { status: 202 }),
    );
  });
  expect(await screen.findByText(/filed to the support queue for review/)).toBeVisible();
});

it("allows deliberate correction after a confirmed validation refusal", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: "Local validation refusal" }), {
        status: 400,
      }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<ReportIssueButton />);
  fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
  fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Local validation refusal");
  expect(screen.getByRole("button", { name: "Send feedback" })).toBeEnabled();
});
