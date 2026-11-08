// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SharedLeaseCollections } from "@/components/lease-renewal/SharedLeaseCollections";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("marks required collection fields and retains the selection through missing-date recovery", async () => {
  const posts: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("?ids=")) return Response.json({ leases: [], complete: true });
      if (init?.method !== "POST")
        return Response.json({ collections: [], nextCursor: null });
      const body = JSON.parse(String(init.body));
      posts.push(body);
      return Response.json({
        review: {
          id: body.reviewId,
          collectionId: body.collectionId,
          expectedVersion: 0,
          name: body.name,
          basis: body.basis,
          members: [],
          added: [],
          removed: [],
          sourceReadAt: "2026-11-06T12:00:00Z",
          createdAt: "2026-11-06T12:00:00Z",
          expiresAt: "2026-11-06T13:00:00Z",
        },
      });
    }),
  );
  render(
    <SharedLeaseCollections
      ownerUid="synthetic-editor"
      initialMembers={["9101", "9102"]}
    />,
  );
  const name = screen.getByLabelText("Collection name");
  const from = screen.getByLabelText("Period from");
  const through = screen.getByLabelText("Period through");
  for (const field of [name, from, through]) {
    expect(field).toBeRequired();
    expect(field).toHaveAttribute("aria-required", "true");
  }
  fireEvent.change(name, { target: { value: "Synthetic reviewed group" } });
  fireEvent.click(screen.getByRole("button", { name: "Review membership" }));
  expect(await screen.findByText("Choose Period from.")).toBeVisible();
  expect(screen.getByText("Choose Period through.")).toBeVisible();
  expect(from).toHaveFocus();
  expect(from).toHaveAttribute("aria-invalid", "true");
  expect(posts).toHaveLength(0);
  expect(name).toHaveValue("Synthetic reviewed group");
  expect(screen.getByLabelText("Selected lease IDs")).toHaveValue("9101, 9102");
  fireEvent.change(from, { target: { value: "2026-12-01" } });
  fireEvent.change(through, { target: { value: "2026-12-31" } });
  fireEvent.click(screen.getByRole("button", { name: "Review membership" }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toMatchObject({
    action: "review",
    name: "Synthetic reviewed group",
    basis: {
      mode: "explicit",
      from: "2026-12-01",
      through: "2026-12-31",
      selectedLeaseIds: ["9101", "9102"],
    },
  });
  expect(
    await screen.findByRole("region", { name: "Reviewed membership" }),
  ).toBeVisible();
});
