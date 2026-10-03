// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeaseTermReviewControl } from "@/components/lease-renewal/LeaseTermReviewControl";
import { fixedTermProjection } from "@/tests/helpers/lease-term-fixtures";

// S155 (7faed032): the lease term saves when it is chosen. Month-to-month also needs its start
// date, so that choice saves once the date is entered; the narrative is optional context; a failed
// save keeps the choice with a retry; an older response never replaces a newer save. Values are
// synthetic.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function deferred() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Response>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function stubFetch() {
  const pending: ReturnType<typeof deferred>[] = [];
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = deferred();
    pending.push(next);
    return next.promise;
  });
  vi.stubGlobal("fetch", fetch);
  return {
    fetch,
    pending,
    body: (index: number) =>
      JSON.parse(String(fetch.mock.calls[index]![1]?.body)) as Record<string, unknown>,
  };
}

function mount() {
  render(
    <LeaseTermReviewControl
      canEdit
      leaseId="701"
      recordedTerm={null}
      term={fixedTermProjection()}
    />,
  );
}

const select = () => screen.getByLabelText("Lease term") as HTMLSelectElement;
const status = () => document.querySelector("[data-autosave]") as HTMLElement;

describe("S155 lease term autosave", () => {
  it("BEH-S155-1/3: choosing a term saves it with saving then saved feedback, no Save button and no required narrative", async () => {
    const stub = stubFetch();
    mount();
    expect(screen.queryByRole("button", { name: /record lease term/i })).toBeNull();
    expect(screen.getByLabelText("Context (optional)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Reason/)).toBeNull();
    expect(status()).toHaveAttribute("data-autosave", "idle");
    fireEvent.change(select(), { target: { value: "month_to_month" } });
    // Month-to-month is unfinished until its start date is entered: nothing is sent and the
    // choice stays as made.
    expect(stub.fetch).not.toHaveBeenCalled();
    expect(select().value).toBe("month_to_month");
    expect(status()).toHaveAttribute("data-autosave", "idle");
    fireEvent.change(select(), { target: { value: "fixed_term" } });
    await waitFor(() => expect(stub.fetch).toHaveBeenCalledTimes(1));
    expect(status()).toHaveAttribute("data-autosave", "saving");
    expect(status()).toHaveTextContent("Saving lease term");
    expect(stub.body(0)).toEqual({
      lease_id: "701",
      term: "fixed_term",
      source_fingerprint: fixedTermProjection().sourceFingerprint,
    });
    stub.pending[0].resolve(Response.json({ status: "recorded" }));
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "saved"));
    expect(status()).toHaveTextContent("Saved");
  });

  it("BEH-S155-2: the month-to-month start date completes the choice and saves it; optional context saves when left", async () => {
    const stub = stubFetch();
    mount();
    fireEvent.change(select(), { target: { value: "month_to_month" } });
    const anchor = screen.getByLabelText(/Month-to-month since/);
    fireEvent.change(anchor, { target: { value: "2025-09-15" } });
    await waitFor(() => expect(stub.fetch).toHaveBeenCalledTimes(1));
    expect(stub.body(0)).toMatchObject({
      term: "month_to_month",
      anchor_date: "2025-09-15",
    });
    expect(stub.body(0)).not.toHaveProperty("reason");
    stub.pending[0].resolve(Response.json({ status: "recorded" }));
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "saved"));
    const context = screen.getByLabelText("Context (optional)");
    fireEvent.change(context, { target: { value: "Confirmed on a tenant call" } });
    expect(stub.fetch).toHaveBeenCalledTimes(1);
    fireEvent.blur(context);
    await waitFor(() => expect(stub.fetch).toHaveBeenCalledTimes(2));
    expect(stub.body(1)).toMatchObject({
      term: "month_to_month",
      anchor_date: "2025-09-15",
      reason: "Confirmed on a tenant call",
    });
    stub.pending[1].resolve(Response.json({ status: "recorded" }));
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "saved"));
    expect(context).toHaveValue("Confirmed on a tenant call");
  });

  it("BEH-S155-4: a failed save keeps the choice and Try again sends the same choice", async () => {
    const stub = stubFetch();
    mount();
    fireEvent.change(select(), { target: { value: "month_to_month" } });
    fireEvent.change(screen.getByLabelText(/Month-to-month since/), {
      target: { value: "2025-09-15" },
    });
    await waitFor(() => expect(stub.fetch).toHaveBeenCalledTimes(1));
    stub.pending[0].resolve(
      Response.json({ error: "The lease facts changed. Review them." }, { status: 409 }),
    );
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "failed"));
    expect(status()).toHaveTextContent(
      "Save failed. The lease facts changed. Review them. Your entry is kept.",
    );
    expect(select().value).toBe("month_to_month");
    expect(screen.getByLabelText(/Month-to-month since/)).toHaveValue("2025-09-15");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(stub.fetch).toHaveBeenCalledTimes(2));
    expect(stub.body(1)).toEqual(stub.body(0));
    stub.pending[1].resolve(Response.json({ status: "recorded" }));
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "saved"));
  });

  it("BEH-S155-5: an older response never replaces the state of a newer save", async () => {
    const stub = stubFetch();
    mount();
    fireEvent.change(select(), { target: { value: "month_to_month" } });
    const anchor = screen.getByLabelText(/Month-to-month since/);
    fireEvent.change(anchor, { target: { value: "2025-09-15" } });
    fireEvent.change(anchor, { target: { value: "2025-10-01" } });
    await waitFor(() => expect(stub.fetch).toHaveBeenCalledTimes(2));
    expect(stub.body(0)).toMatchObject({ anchor_date: "2025-09-15" });
    expect(stub.body(1)).toMatchObject({ anchor_date: "2025-10-01" });
    // The newer save is still in flight when the older one fails: the failure is ignored.
    stub.pending[0].resolve(
      Response.json({ error: "Stale fingerprint." }, { status: 409 }),
    );
    await Promise.resolve();
    expect(status()).toHaveAttribute("data-autosave", "saving");
    stub.pending[1].resolve(Response.json({ status: "recorded" }));
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "saved"));
    expect(anchor).toHaveValue("2025-10-01");
    // And the reverse: a late success of the older save never hides the newer failure.
    fireEvent.change(anchor, { target: { value: "2025-11-01" } });
    fireEvent.change(anchor, { target: { value: "2025-12-01" } });
    await waitFor(() => expect(stub.fetch).toHaveBeenCalledTimes(4));
    stub.pending[3].resolve(Response.json({ error: "Refused." }, { status: 409 }));
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "failed"));
    stub.pending[2].resolve(Response.json({ status: "recorded" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(status()).toHaveAttribute("data-autosave", "failed");
    expect(anchor).toHaveValue("2025-12-01");
  });
});
