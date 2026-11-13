// @vitest-environment jsdom
// S285 R-S285-6 (BEH-S285-5, AC-S285-2): in Ask the owner, an existing template approver reads "New
// owner wording that asks about the term is ready to publish." and, before publishing, the
// consequence with the count of unsent owner messages that will be held for review. The publish
// carries that count; a changed count is stated again and nothing is published. An Editor sees no
// publish control, and nothing shows once v2.1 is in use. Only the route seam is simulated.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerWordingPublication } from "@/components/lease-renewal/OwnerWordingPublication";

const READY = "New owner wording that asks about the term is ready to publish.";

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bodyOf = (call: number) =>
  JSON.parse((fetchMock.mock.calls[call]![1] as { body: string }).body);

describe("AC-S285-2 the approver's publication control", () => {
  it("R-S285-6: an Editor sees no publish control", () => {
    render(
      <OwnerWordingPublication
        ownerCopy={{ version: "v2.0", readyToPublish: true, canPublish: false }}
      />,
    );
    expect(screen.queryByText(READY)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("R-S285-6: nothing shows once the new wording is in use", () => {
    render(
      <OwnerWordingPublication
        ownerCopy={{ version: "v2.1", readyToPublish: false, canPublish: true }}
      />,
    );
    expect(screen.queryByText(READY)).toBeNull();
  });

  it("BEH-S285-5: the approver reads the line, then the count, and publishing carries that count", async () => {
    const onPublished = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { status: "ready", heldCount: 3 }))
      .mockResolvedValueOnce(
        jsonResponse(200, { status: "approved", duplicate: false, heldCount: 3 }),
      );
    render(
      <OwnerWordingPublication
        onPublished={onPublished}
        ownerCopy={{ version: "v2.0", readyToPublish: true, canPublish: true }}
      />,
    );
    expect(screen.getByText(READY)).toBeInTheDocument();
    // Nothing is read or published until the approver asks.
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review the new owner wording" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Publishing changes the owner message. 3 unsent owner messages were reviewed with the current wording and will be held for review.",
        ),
      ).toBeInTheDocument(),
    );
    expect(bodyOf(0)).toEqual({ kind: "publish_owner_copy", version: "v2.1" });
    fireEvent.click(
      screen.getByRole("button", { name: "Publish the new owner wording" }),
    );
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(bodyOf(1)).toEqual({
      kind: "publish_owner_copy",
      version: "v2.1",
      confirm: { heldCount: 3 },
    });
    expect(
      screen.getByText(
        "The new owner wording is published. Owner messages now state the renewal term.",
      ),
    ).toBeInTheDocument();
  });

  it("AC-S285-2: a count that changed is stated again and nothing is published", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { status: "ready", heldCount: 3 }))
      .mockResolvedValueOnce(
        jsonResponse(409, {
          error:
            "The number of unsent owner messages changed to 4 since this review, so nothing was published. Review the new owner wording again.",
          code: "owner_copy_count_changed",
          heldCount: 4,
        }),
      );
    render(
      <OwnerWordingPublication
        ownerCopy={{ version: "v2.0", readyToPublish: true, canPublish: true }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review the new owner wording" }));
    await screen.findByRole("button", { name: "Publish the new owner wording" });
    fireEvent.click(
      screen.getByRole("button", { name: "Publish the new owner wording" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          "Publishing changes the owner message. 4 unsent owner messages were reviewed with the current wording and will be held for review.",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("changed to 4");
    expect(screen.queryByText(/is published/)).toBeNull();
  });
});
