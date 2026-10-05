// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CommunicationsRetentionAdminPanel } from "@/components/admin/CommunicationsRetentionAdminPanel";
import { OperationalPageBuilderPanel } from "@/components/admin/OperationalPageBuilderPanel";
import {
  OPERATIONAL_PAGE_APPROVAL_CONFIRMATION,
  OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION,
} from "@/lib/operational-pages/schema";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function prepareHold() {
  render(<CommunicationsRetentionAdminPanel />);
  fireEvent.change(screen.getByRole("textbox", { name: "Record ID" }), {
    target: { value: "local-bodyless-record" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Case reference" }), {
    target: { value: "Local case" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Plain-English reason" }), {
    target: { value: "Keep this local reason" },
  });
}
function preparePage() {
  render(
    <OperationalPageBuilderPanel spaces={[{ id: "local-space", name: "Local Space" }]} />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Page address slug" }), {
    target: { value: "local-page" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Page title" }), {
    target: { value: "Local page" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Reason for this version" }), {
    target: { value: "Local reviewed reason" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add text" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Paragraph text" }), {
    target: { value: "Local safe text" },
  });
}

it("never claims a legal-hold result from an unreadable response body and retains the exact replay key", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new TypeError("body lost")),
    })
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "duplicate", legalHold: true })),
    );
  vi.stubGlobal("fetch", fetch);
  prepareHold();
  fireEvent.click(screen.getByRole("button", { name: "Apply legal hold" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed/);
  expect(screen.queryByText(/Recorded: legal hold released/)).toBeNull();
  expect(screen.getByRole("textbox", { name: "Plain-English reason" })).toHaveValue(
    "Keep this local reason",
  );
  expect(screen.getByRole("button", { name: "Apply legal hold" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry exact decision" }));
  await screen.findByText(/Already recorded: legal hold active/);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);
});

it("terminates a stalled legal-hold wait without clearing its reason or allowing a new decision", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetch);
  prepareHold();
  fireEvent.click(screen.getByRole("button", { name: "Apply legal hold" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60001);
  });
  expect(screen.getByRole("alert")).toHaveTextContent(/not confirmed/);
  expect(screen.getByRole("textbox", { name: "Plain-English reason" })).toHaveValue(
    "Keep this local reason",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("fences an unknown page draft, retains its input and exposes genuine history recovery", async () => {
  const fetch = vi.fn(async (_url, init) =>
    init?.method === "POST"
      ? Promise.reject(new TypeError("offline"))
      : new Response(JSON.stringify({ heads: [], versions: [] })),
  );
  vi.stubGlobal("fetch", fetch);
  preparePage();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(
    screen.getByRole("button", { name: "Save immutable draft and preview" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed/);
  expect(screen.getByRole("textbox", { name: "Page title" })).toHaveValue("Local page");
  expect(
    screen.getByRole("button", { name: "Save immutable draft and preview" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reload page history" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "Save immutable draft and preview" }),
  ).toBeDisabled();
});

it("recovers failed page history through its owning GET without changing the editor", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Local history unavailable" }), {
        status: 503,
      }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ heads: [], versions: [] })));
  vi.stubGlobal("fetch", fetch);
  preparePage();
  expect(await screen.findByRole("alert")).toHaveTextContent(/history unavailable/);
  fireEvent.click(screen.getByRole("button", { name: "Reload page history" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("textbox", { name: "Page title" })).toHaveValue("Local page");
});

it("prevents synchronous draft double dispatch and editing underneath a pending exact version", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn(async (_url, init) =>
    init?.method === "POST"
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : new Response(JSON.stringify({ heads: [], versions: [] })),
  );
  vi.stubGlobal("fetch", fetch);
  preparePage();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const button = screen.getByRole("button", { name: "Save immutable draft and preview" });
  act(() => {
    button.click();
    button.click();
  });
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(screen.getByRole("textbox", { name: "Page title" })).toBeDisabled();
  await act(async () => {
    finish(new Response(JSON.stringify({ error: "Local refusal" }), { status: 400 }));
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Local refusal");
  expect(screen.getByRole("textbox", { name: "Page title" })).toBeEnabled();
});

it("requires a fresh history read and deliberate saved-version review before another exact page action", async () => {
  const version = {
    id: "local-verified-version",
    pageId: "local-page",
    versionNumber: 1,
    state: "draft",
    previewHash: "a".repeat(64),
    createdByUid: "local-admin",
    createdAt: "2026-10-04T00:00:00.000Z",
    definition: {
      pageType: "operational_process",
      spaceId: "local-space",
      slug: "local-page",
      title: "Verified saved page",
      components: [{ type: "text", text: "Verified local saved text" }],
    },
  };
  let post = 0;
  const fetch = vi.fn(async (_url, init) => {
    if (init?.method === "POST") {
      post++;
      return post === 1
        ? Promise.reject(new TypeError("lost draft receipt"))
        : new Response(
            JSON.stringify({
              approval: { versionId: version.id, previewHash: version.previewHash },
            }),
          );
    }
    return new Response(JSON.stringify({ heads: [], versions: [version] }));
  });
  vi.stubGlobal("fetch", fetch);
  preparePage();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(
    screen.getByRole("button", { name: "Save immutable draft and preview" }),
  );
  await screen.findByRole("alert");
  expect(screen.queryByRole("combobox", { name: "Review a saved version" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reload page history" }));
  const review = await screen.findByRole("combobox", { name: "Review a saved version" });
  fireEvent.change(review, { target: { value: version.id } });
  expect(screen.getByText("Verified local saved text")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Save immutable draft and preview" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: OPERATIONAL_PAGE_APPROVAL_CONFIRMATION }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve exact version" }));
  await screen.findByText("Exact version approved. Nothing is published yet.");
  const posts = fetch.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(2);
  expect(JSON.parse(posts[1][1].body)).toMatchObject({
    operation: "approve",
    versionId: version.id,
    previewHash: version.previewHash,
  });
});

it("fences a publication conflict from post-commit readback and never repeats publication", async () => {
  const version = {
    id: "local-publication-version",
    pageId: "local-page",
    versionNumber: 1,
    state: "draft",
    previewHash: "b".repeat(64),
    createdByUid: "local-admin",
    createdAt: "2026-10-04T00:00:00.000Z",
    definition: {
      pageType: "operational_process",
      spaceId: "local-space",
      slug: "local-page",
      title: "Local page",
      components: [{ type: "text", text: "Local safe text" }],
    },
  };
  const fetch = vi.fn(async (_url, init) => {
    if (init?.method !== "POST")
      return new Response(JSON.stringify({ heads: [], versions: [version] }));
    const body = JSON.parse(init.body);
    if (body.operation === "draft") return new Response(JSON.stringify({ version }));
    if (body.operation === "approve")
      return new Response(JSON.stringify({ approval: { versionId: version.id } }));
    return new Response(
      JSON.stringify({ error: "Operational page publication readback failed." }),
      { status: 409 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  preparePage();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(
    screen.getByRole("button", { name: "Save immutable draft and preview" }),
  );
  await screen.findByRole("region", { name: "Exact operational page preview" });
  fireEvent.click(
    screen.getByRole("checkbox", { name: OPERATIONAL_PAGE_APPROVAL_CONFIRMATION }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve exact version" }));
  await screen.findByText("Exact version approved. Nothing is published yet.");
  fireEvent.click(
    screen.getByRole("checkbox", { name: OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Publish approved version" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed/);
  expect(screen.getByRole("button", { name: "Publish approved version" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Reason for this version" })).toHaveValue(
    "Local reviewed reason",
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload page history" }));
  await screen.findByRole("combobox", { name: "Review a saved version" });
  expect(screen.getByRole("button", { name: "Publish approved version" })).toBeDisabled();
  const publications = fetch.mock.calls.filter(
    ([, init]) =>
      init?.method === "POST" && JSON.parse(init.body).operation === "publish",
  );
  expect(publications).toHaveLength(1);
  expect(
    screen.queryByText("Published and read back. The page remains read-only."),
  ).toBeNull();
});
