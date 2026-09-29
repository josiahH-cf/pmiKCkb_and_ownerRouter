/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilledArtifactPanel } from "@/components/lease-renewal/FilledArtifactPanel";
import { createFilledArtifactHandlers } from "@/app/api/lease-renewal/filled-artifact/route";
import {
  prepareDerivedArtifact,
  approveDerivedArtifact,
  readDerivedArtifactStatus,
  readDerivedArtifactContent,
} from "@/lib/firestore/lease-derived-artifacts";
import { readAcroformValues } from "@/lib/lease-documents/acroform-pdf";
import {
  setupSyntheticAcceptance,
  acceptanceFields,
  admin,
  sha,
} from "@/tests/fixtures/s130-derived";

beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("S130 mounted controls through actual routes and saved content", () => {
  it("prepares, downloads and approves the exact 14-field saved PDF only through explicit controls", async () => {
    const t = await setupSyntheticAcceptance();
    const handlers = createFilledArtifactHandlers({
      requireCapabilityInSpace: vi.fn(async () => admin),
      read: (actor, request) => readDerivedArtifactStatus(actor, request, t.db, t.deps),
      prepare: (actor, request) => prepareDerivedArtifact(actor, request, t.db, t.deps),
      approve: (actor, request) => approveDerivedArtifact(actor, request, t.db, t.deps),
      content: (actor, request) =>
        readDerivedArtifactContent(actor, request, t.db, t.deps),
    });
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const request = new Request(new URL(url, "http://synthetic.test"), init);
      return init?.method === "POST" ? handlers.POST(request) : handlers.GET(request);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<FilledArtifactPanel {...t.request} />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check filled document" }));
    fireEvent.click(await screen.findByRole("button", { name: "Prepare filled PDF" }));
    const link = await screen.findByRole("link", {
      name: "Download filled PDF for inspection",
    });
    // jsdom has no file-navigation implementation: follow the actual rendered href via the real GET handler.
    const response = await fetcher(link.getAttribute("href")!);
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(await readAcroformValues(bytes)).toEqual(acceptanceFields);
    expect(response.headers.get("X-Artifact-SHA256")).toBe(sha(bytes));
    const approve = screen.getByRole("button", { name: "Approve exact filled PDF" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(approve);
    await screen.findByText(/approved for this exact output/);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    const request = JSON.parse(fetcher.mock.calls[3][1]!.body as string);
    expect(request).toMatchObject({
      action: "approve",
      outputHash: sha(bytes),
      inspected: true,
    });
    const readback = await readDerivedArtifactContent(
      admin,
      { ...t.request, derivedId: request.derivedId, requireApproval: true },
      t.db,
      t.deps,
    );
    expect(readback.content).toEqual(bytes);
    expect(readback.record.approval?.outputHash).toBe(sha(bytes));
  });
});
