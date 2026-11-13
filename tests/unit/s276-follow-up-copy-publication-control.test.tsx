// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowUpCopyPublication } from "@/components/lease-renewal/FollowUpCopyPublication";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S276 R-S276-8 follow-up copy publication", () => {
  it("shows no publish action without the approver's unpublished read", () => {
    const { rerender } = render(
      <FollowUpCopyPublication status={undefined} onPublished={vi.fn()} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<FollowUpCopyPublication status="approved" onPublished={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The standard follow-up message is published.",
    );
  });

  it("publishes from one click and shows the server's approved readback", async () => {
    const answer = Promise.withResolvers<Response>();
    const request = vi.fn(() => answer.promise);
    const onPublished = vi.fn();
    vi.stubGlobal("fetch", request);
    const { rerender } = render(
      <FollowUpCopyPublication status="unpublished" onPublished={onPublished} />,
    );
    const publish = screen.getByRole("button", {
      name: "Publish the standard follow-up message",
    });
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(publish);
    fireEvent.click(publish);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/api/lease-renewal/message-preparation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ kind: "publish_follow_up" }),
      }),
    );
    expect(onPublished).not.toHaveBeenCalled();
    answer.resolve(Response.json({ status: "approved" }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledOnce());
    rerender(<FollowUpCopyPublication status="approved" onPublished={onPublished} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "The standard follow-up message is published.",
    );
  });
});
