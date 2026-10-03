// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalCompPreparation } from "@/components/lease-renewal/RenewalCompPreparation";
import { RenewalManualProvider } from "@/components/lease-renewal/RenewalManualWorkspace";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

// S155: the comparison preparation form (OwnerDecisionForm in preparation mode) saves each
// completed valid figure by itself, keeps an unfinished figure typed while the others save, shows
// saving / saved / failed feedback from the confirmed store response, retries the same entry
// with the same request identity, and never lets an older response replace a newer value. All
// values are synthetic.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CYCLE = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const META = { actorUid: "operator", recordedAt: "2026-09-10T12:00:00.000Z" };
const initial = () =>
  emptyRenewalWorkspace("701", CYCLE, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });

type Posted = { body: Record<string, unknown>; respond: (response: Response) => void };

/**
 * A workspace route stand-in: reads return the current state; records are planned with the real
 * store planner and answered when the test releases them, so timing is under test control.
 */
function stubWorkspace(options: { fail?: (attempt: number) => boolean } = {}) {
  let state: RenewalWorkspaceState = initial();
  const posts: Posted[] = [];
  let attempts = 0;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("comp-screenshot"))
      return Response.json({ status: "absent" });
    if (init?.method !== "POST")
      return Response.json({ state, activity: [], observations: [] });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    attempts += 1;
    // A lost response: the request may or may not have been stored.
    if (options.fail?.(attempts)) throw new TypeError("Failed to fetch");
    return new Promise<Response>((resolve) => {
      posts.push({
        body,
        respond: resolve,
      });
    });
  });
  vi.stubGlobal("fetch", fetch);
  const accept = (post: Posted) => {
    state = planRenewalWorkspaceAction(
      state,
      post.body.action as Parameters<typeof planRenewalWorkspaceAction>[1],
      { ...META, eventId: String(post.body.operationId) },
    );
    post.respond(Response.json({ state }));
  };
  return {
    fetch,
    posts,
    accept,
    acceptAll: () => {
      while (posts.length) accept(posts.shift()!);
    },
    current: () => state,
  };
}

function mount() {
  render(
    <RenewalManualProvider leaseId="701" initialState={initial()}>
      <RenewalCompPreparation
        address="Fixture subject"
        currentRent={1200}
        compScreenshotExecutable={false}
      />
    </RenewalManualProvider>,
  );
}

const low = () => screen.getByLabelText(/Market rent: low estimate/) as HTMLInputElement;
const high = () =>
  screen.getByLabelText(/Market rent: high estimate/) as HTMLInputElement;
const pmi = () =>
  screen.getByLabelText(/PMI recommended monthly rent/) as HTMLInputElement;
const status = () => document.querySelector("[data-autosave]") as HTMLElement;
const records = (stub: ReturnType<typeof stubWorkspace>) =>
  stub.fetch.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe("S155 comparison preparation autosave", () => {
  it("BEH-S155-1/3: a completed figure saves when focus leaves the form, with saving then saved feedback and no Save button", async () => {
    const stub = stubWorkspace();
    mount();
    expect(screen.queryByRole("button", { name: /save comp preparation/i })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(status()).toHaveAttribute("data-autosave", "idle");
    fireEvent.change(pmi(), { target: { value: "1300" } });
    // Typing alone saves nothing.
    expect(records(stub)).toHaveLength(0);
    fireEvent.blur(pmi());
    await waitFor(() => expect(stub.posts).toHaveLength(1));
    expect(status()).toHaveAttribute("data-autosave", "saving");
    expect(status()).toHaveTextContent("Saving comparison preparation");
    expect(stub.posts[0].body).toMatchObject({
      operation: "record",
      leaseId: "701",
      cycleId: CYCLE,
      expectedRevision: 0,
      action: { kind: "preparation", pmiNumber: 1300, recommendationBasis: "reviewed" },
    });
    // Saved only once the store confirmed and returned the stored value.
    stub.acceptAll();
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "saved"));
    expect(status()).toHaveTextContent("Saved");
    expect(stub.current().preparation?.market.pmiNumber).toBe(1300);
    expect(pmi().value).toBe("1300");
  });

  it("BEH-S155-2 (AC-S155-1): an unfinished figure stays typed while the other completed figures save", async () => {
    const stub = stubWorkspace();
    mount();
    fireEvent.change(low(), { target: { value: "1250" } });
    fireEvent.change(high(), { target: { value: "14x" } });
    fireEvent.blur(high());
    await waitFor(() => expect(stub.posts).toHaveLength(1));
    expect(stub.posts[0].body.action).toMatchObject({
      kind: "preparation",
      rangeLow: 1250,
    });
    expect(stub.posts[0].body.action).not.toHaveProperty("rangeHigh");
    expect(high().value).toBe("14x");
    expect(
      screen.getByText(/A figure that is still being typed stays in its field/),
    ).toBeInTheDocument();
    stub.acceptAll();
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "saved"));
    expect(stub.current().preparation?.market.rangeLow).toBe(1250);
    expect(stub.current().preparation?.market).not.toHaveProperty("rangeHigh");
    expect(high().value).toBe("14x");
    // Finishing the figure saves it with the rest.
    fireEvent.change(high(), { target: { value: "1400" } });
    fireEvent.blur(high());
    await waitFor(() => expect(stub.posts).toHaveLength(1));
    expect(stub.posts[0].body).toMatchObject({
      expectedRevision: 1,
      action: { kind: "preparation", rangeLow: 1250, rangeHigh: 1400 },
    });
    stub.acceptAll();
    await waitFor(() => expect(stub.current().preparation?.market.rangeHigh).toBe(1400));
  });

  it("BEH-S155-3/4/5: a lost response keeps the entry, says so, and Try again reuses the same request identity", async () => {
    const stub = stubWorkspace({ fail: (attempt) => attempt === 1 });
    mount();
    fireEvent.change(pmi(), { target: { value: "1325" } });
    fireEvent.blur(pmi());
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "failed"));
    expect(status()).toHaveTextContent("Save failed. The save did not finish.");
    expect(status()).toHaveTextContent("Your entry is kept.");
    expect(pmi().value).toBe("1325");
    expect(stub.current().preparation).toBeNull();
    const first = records(stub);
    expect(first).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(stub.posts).toHaveLength(1));
    expect(status()).toHaveAttribute("data-autosave", "saving");
    // The same entry, the same request: a duplicate on the server is a replay, not new activity.
    expect(stub.posts[0].body.operationId).toBe(first[0].operationId);
    expect(stub.posts[0].body.action).toEqual(first[0].action);
    stub.acceptAll();
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "saved"));
    expect(stub.current().preparation?.market.pmiNumber).toBe(1325);
    expect(pmi().value).toBe("1325");
  });

  it("BEH-S155-5 (AC-S155-2): saves run in order against the confirmed revision and an older response never replaces the newer value", async () => {
    const stub = stubWorkspace();
    mount();
    fireEvent.change(pmi(), { target: { value: "1300" } });
    fireEvent.blur(pmi());
    await waitFor(() => expect(stub.posts).toHaveLength(1));
    // A second edit while the first save is still in flight waits for its confirmation.
    fireEvent.change(pmi(), { target: { value: "1350" } });
    fireEvent.blur(pmi());
    expect(stub.posts).toHaveLength(1);
    expect(records(stub)).toHaveLength(1);
    stub.accept(stub.posts.shift()!);
    await waitFor(() => expect(stub.posts).toHaveLength(1));
    expect(stub.posts[0].body).toMatchObject({
      expectedRevision: 1,
      action: { kind: "preparation", pmiNumber: 1350 },
    });
    expect(stub.posts[0].body.operationId).not.toBe(records(stub)[0].operationId);
    // The newer entry is what the field shows while the older confirmation is applied.
    expect(pmi().value).toBe("1350");
    stub.acceptAll();
    await waitFor(() => expect(stub.current().preparation?.market.pmiNumber).toBe(1350));
    expect(stub.current().revision).toBe(2);
    expect(pmi().value).toBe("1350");
    expect(status()).toHaveAttribute("data-autosave", "saved");
  });

  it("BEH-S155-8: saving a preparation dispatches nothing to a provider, Gmail or the Sheet", async () => {
    const stub = stubWorkspace();
    mount();
    fireEvent.change(low(), { target: { value: "1250" } });
    fireEvent.change(high(), { target: { value: "1400" } });
    fireEvent.change(pmi(), { target: { value: "1300" } });
    fireEvent.blur(pmi());
    await waitFor(() => expect(stub.posts).toHaveLength(1));
    stub.acceptAll();
    await waitFor(() => expect(status()).toHaveAttribute("data-autosave", "saved"));
    const urls = stub.fetch.mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.endsWith("market-comps"))).toHaveLength(0);
    expect(urls.filter((url) => url.includes("operating-sheet"))).toHaveLength(0);
    expect(urls.filter((url) => url.includes("rentvine-writeback"))).toHaveLength(0);
    expect(urls.filter((url) => url.includes("renewal-notice-draft"))).toHaveLength(0);
    // The saved market value is an app record with a separate, still unconfirmed Sheet intent.
    expect(stub.current().sourceUpdates.market_value).toMatchObject({ state: "pending" });
  });
});
