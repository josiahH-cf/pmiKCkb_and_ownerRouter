// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenewalOriginalPublicationPolicy } from "@/components/admin/RenewalOriginalPublicationPolicy";
import { TrustedPublicationPanel } from "@/components/spaces/TrustedPublicationPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function file() {
  const value = new File(["%PDF-1.7\n% SYNTHETIC REVIEW ONLY\n%%EOF"], "blank.pdf", {
    type: "application/pdf",
  });
  Object.defineProperty(value, "arrayBuffer", {
    value: async () =>
      new TextEncoder().encode("%PDF-1.7\n% SYNTHETIC REVIEW ONLY\n%%EOF").buffer,
  });
  return value;
}
describe("S130 ordinary exact-original review/publication controls", () => {
  it("hashes locally, requires the exact blank-source attestation, then sends metadata only through Admin policy creation", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({
        policy: { ...JSON.parse(String(init?.body)), id: "fixture-policy" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RenewalOriginalPublicationPolicy onSave={vi.fn()} />);
    await user.click(
      screen.getByText("Review one blank renewal original for publication"),
    );
    await user.type(screen.getByLabelText("Original connector ID"), "fixture-originals");
    await user.type(screen.getByLabelText("Original root ID"), "fixture-root");
    await user.upload(
      screen.getByLabelText("Choose original for local hash review"),
      file(),
    );
    await waitFor(() =>
      expect(screen.getByText(/Exact local file hash loaded/)).toBeVisible(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Create exact original policy" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    await user.type(
      screen.getByLabelText("Original review reason"),
      "Synthetic exact blank-source review only.",
    );
    await user.click(
      screen.getByRole("button", { name: "Create exact original policy" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/publication-policies");
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      allowedSpaces: ["lease-renewals"],
      scannerKey: "managed-clamav-renewal-original-v1",
      resourceScope: {
        resourceType: "file",
        artifactKind: "renewal_extension",
        fileName: "blank.pdf",
        path: "sources/blank.pdf",
        reviewedBlankOriginal: true,
        reviewedNoClientData: true,
      },
    });
    expect(payload.resourceScope.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.resourceScope.resourceId).toMatch(/^source:[a-f0-9]{64}$/);
    expect(String(init?.body)).not.toContain("SYNTHETIC REVIEW ONLY");
  });
  it("requires current metadata readback after an uncertain original upload, without blindly uploading again", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new Error("Response unavailable");
      return Response.json({
        originals: [
          {
            id: "fixture-version",
            fileName: "blank.pdf",
            contentHash: "a".repeat(64),
            byteSize: 123,
            artifactKind: "renewal_extension",
            policyId: "fixture-policy",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<TrustedPublicationPanel canEdit spaceId="lease-renewals" />);
    fireEvent.change(screen.getByLabelText("Citation label"), {
      target: { value: "Synthetic original" },
    });
    const input = screen.getByLabelText("Add files");
    fireEvent.change(input, { target: { files: [file()] } });
    await waitFor(() => expect(input).toBeDisabled());
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { files: [file()] } });
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "Read current original publications" }),
    );
    await waitFor(() =>
      expect(screen.getByText("publication:fixture-version")).toBeVisible(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(input).toBeEnabled();
  });
});
