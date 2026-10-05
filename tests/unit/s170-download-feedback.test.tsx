// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DownloadLink } from "@/components/ui/DownloadLink";

// S170: a download says what actually happened. The file is read first, so a refusal or a lost
// connection is reported on the current screen with a retry and a supported fallback, instead of
// replacing the workspace with an error page. Every expectation is on the rendered status and the
// captured requests.

const HREF = "/api/lease-renewal/filled-artifact?leaseId=100&derivedId=fixture";
let saved: { name: string; href: string }[];

beforeEach(() => {
  saved = [];
  URL.createObjectURL = vi.fn(() => "blob:fixture-file");
  URL.revokeObjectURL = vi.fn();
  // Only the component's own save step calls click(); a person's click arrives as an event.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ name: this.download, href: this.href });
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function pdf(name: string) {
  return new Response("%PDF-fixture", {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}

function renderLink() {
  render(
    <DownloadLink fileName="filled-lease.pdf" href={HREF}>
      Download filled PDF for inspection
    </DownloadLink>,
  );
  return screen.getByRole("link", { name: "Download filled PDF for inspection" });
}

describe("S170 download feedback reflects the actual outcome", () => {
  it("says the download is being prepared, then that it started, naming the served file", async () => {
    let release!: (response: Response) => void;
    const requests = vi.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((resolve) => {
          void input;
          release = resolve;
        }),
    );
    vi.stubGlobal("fetch", requests);
    const link = renderLink();
    expect(link).toHaveAttribute("href", HREF);
    expect(screen.getByRole("status")).toHaveAttribute("data-download", "idle");

    fireEvent.click(link);
    expect(screen.getByRole("status")).toHaveTextContent("Preparing the download…");
    expect(link).toHaveAttribute("aria-busy", "true");
    expect(saved).toHaveLength(0);

    await act(async () => release(pdf("Filled lease 100.pdf")));
    await vi.waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Download started: Filled lease 100.pdf",
      ),
    );
    expect(requests).toHaveBeenCalledTimes(1);
    expect(String(requests.mock.calls[0]?.[0])).toBe(HREF);
    expect(saved).toEqual([{ name: "Filled lease 100.pdf", href: "blob:fixture-file" }]);
    expect(link).not.toHaveAttribute("aria-busy");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("reports the server's refusal on this screen and offers a retry and a new-tab fallback", async () => {
    const requests = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: "This is not the current filled output." },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(pdf("Filled lease 100.pdf"));
    vi.stubGlobal("fetch", requests);
    const link = renderLink();
    fireEvent.click(link);
    await vi.waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "This is not the current filled output.",
      ),
    );
    expect(saved).toHaveLength(0);
    const fallback = screen.getByRole("link", { name: "Open the file in a new tab" });
    expect(fallback).toHaveAttribute("href", HREF);
    expect(fallback).toHaveAttribute("target", "_blank");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Download started: Filled lease 100.pdf",
      ),
    );
    expect(requests).toHaveBeenCalledTimes(2);
    expect(saved).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("reports a lost connection as a failure it can retry, never as a download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    fireEvent.click(renderLink());
    await vi.waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "The file could not be downloaded. The connection was interrupted.",
      ),
    );
    expect(saved).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("stops waiting after the read deadline and says the read did not finish", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    fireEvent.click(renderLink());
    expect(screen.getByRole("status")).toHaveTextContent("Preparing the download…");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "This read did not finish. Retry when ready.",
    );
    expect(saved).toHaveLength(0);
  });

  it("leaves a modified click to the browser", () => {
    const requests = vi.fn();
    vi.stubGlobal("fetch", requests);
    const link = renderLink();
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link, { ctrlKey: true });
    expect(requests).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveAttribute("data-download", "idle");
  });

  it("uses the reporting link for every file download in the renewal workspace", () => {
    const owners = [
      "components/lease-renewal/FilledArtifactPanel.tsx",
      "components/lease-renewal/FilledArtifactHistory.tsx",
      "components/lease-renewal/RenewalMessagePreparation.tsx",
      "components/lease-renewal/RenewalDocumentHandoff.tsx",
    ];
    for (const owner of owners) {
      const source = readFileSync(join(process.cwd(), owner), "utf8");
      expect(source, owner).toContain("<DownloadLink");
      // No plain anchor still points at a file route or a packet file.
      expect(source, owner).not.toMatch(
        /<a\b[^>]*href=\{(?:`\/api\/lease-renewal\/(?:filled-artifact|message-attachment)|a\.downloadUrl)/s,
      );
    }
  });
});
