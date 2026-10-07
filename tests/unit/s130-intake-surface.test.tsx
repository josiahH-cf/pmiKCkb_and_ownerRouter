// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeaseArtifactIntakePanel } from "@/components/admin/LeaseArtifactIntakePanel";
import { projectIntakeCheckpoints } from "@/lib/lease-documents/artifact-intake";
import {
  emptyArtifactIntakeManifest,
  type ArtifactIntakeEntry,
  type ArtifactIntakeManifest,
} from "@/lib/lease-documents/artifact-intake-contract";

// S130 (F10): the Admin surface shows seven honestly pending families, receives a file only by
// publication reference through the Admin route, records a mapping as Preview only and shows the
// resumable checkpoints; it never claims autofill, upload or a signature. Values are synthetic.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const received: ArtifactIntakeEntry = {
  id: "renewal_extension",
  kind: "renewal_extension",
  state: "received",
  revision: 1,
  publication: {
    system: "s21_publication",
    reference: "publication:synthetic-ext-0001",
    contentHash: "a".repeat(64),
  },
  file: { fileName: "synthetic.pdf", detectedMimeType: "application/pdf", byteSize: 120 },
  classification: {
    format: "fillable_pdf",
    contentHash: "a".repeat(64),
    byteSize: 120,
    detectedMimeType: "application/pdf",
    hasAcroForm: true,
    hasXfa: false,
    hasEmbeddedScript: false,
    hasEmbeddedFiles: false,
    approximatePages: 2,
    reasons: [
      "Form fields are present; machine autofill is not available in this repository, so the fields are completed by a person in Dotloop from the worksheet.",
    ],
  },
  received_at: "2026-09-20T12:00:00.000Z",
  received_by_uid: "admin-1",
  updated_at: "2026-09-20T12:00:00.000Z",
};

function withEntry(entry: ArtifactIntakeEntry | null): ArtifactIntakeManifest {
  const manifest = emptyArtifactIntakeManifest();
  return entry
    ? { ...manifest, entries: { ...manifest.entries, [entry.kind]: entry } }
    : manifest;
}

function checkpoints(manifest: ArtifactIntakeManifest) {
  return projectIntakeCheckpoints({
    manifest,
    filledValuesVerified: false,
    packetState: null,
    providerReceiptId: null,
    returnedStateInspected: false,
  });
}

describe("S130 Admin intake surface (AC-S130-1, AC-S130-4, AC-S130-8)", () => {
  it("shows every pending family and the honest checkpoints with no materials", () => {
    const manifest = withEntry(null);
    render(
      <LeaseArtifactIntakePanel
        initial={{ manifest, checkpoints: checkpoints(manifest) }}
      />,
    );
    const families = document.querySelectorAll("[data-artifact-intake-family]");
    // S66 (AC-S66-6): the original seven families plus the three further reference types.
    expect(families).toHaveLength(10);
    expect(
      Array.from(families).every(
        (node) => node.getAttribute("data-artifact-intake-state") === "pending_materials",
      ),
    ).toBe(true);
    expect(screen.getByText(/No family has approved material/)).toBeInTheDocument();
    const steps = document.querySelectorAll("[data-artifact-intake-checkpoint]");
    expect(steps).toHaveLength(7);
    expect(steps[0]).toHaveAttribute("data-artifact-intake-checkpoint-state", "pending");
    expect(steps[1]).toHaveAttribute("data-artifact-intake-checkpoint-state", "blocked");
    expect(document.body.textContent).not.toMatch(/prefilled|autofilled|\bsigned\b/i);
    expect(screen.getByRole("button", { name: "Receive into review" })).toBeDisabled();
  });

  it("receives by publication reference through the Admin route, then records a mapping as Preview only", async () => {
    const calls: Array<{ method: string; body: Record<string, unknown> | null }> = [];
    const after = withEntry(received);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({
          method,
          body: init?.body
            ? (JSON.parse(String(init.body)) as Record<string, unknown>)
            : null,
        });
        if (method === "GET")
          return Response.json({
            artifactIntake: { manifest: after, checkpoints: checkpoints(after) },
          });
        if (method === "POST")
          return Response.json({ artifactIntake: { entry: received, duplicate: false } });
        return Response.json({
          artifactIntake: {
            entry: { ...received, state: "reviewed", revision: 2 },
            duplicate: false,
          },
        });
      }),
    );
    const manifest = withEntry(null);
    render(
      <LeaseArtifactIntakePanel
        initial={{ manifest, checkpoints: checkpoints(manifest) }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Publication reference"), {
      target: { value: "publication:synthetic-ext-0001" },
    });
    fireEvent.change(screen.getByLabelText("Content hash"), {
      target: { value: "a".repeat(64) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Receive into review" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/received and classified/),
    );
    expect(calls[0]).toMatchObject({
      method: "POST",
      body: {
        kind: "renewal_extension",
        publicationSource: {
          system: "s21_publication",
          reference: "publication:synthetic-ext-0001",
          contentHash: "a".repeat(64),
        },
      },
    });
    expect(String(calls[0]?.body?.operationId)).toMatch(/^[0-9a-f-]{36}$/);
    const family = document.querySelector(
      '[data-artifact-intake-family="renewal_extension"]',
    ) as HTMLElement;
    expect(family).toHaveAttribute("data-artifact-intake-state", "received");
    expect(family).toHaveTextContent(
      /Fillable PDF \(form fields present\) \(about 2 pages\)/,
    );
    expect(family).toHaveTextContent(/completed by a person in Dotloop/);
    const record = within(family).getByRole("button", {
      name: "Record mapping for Approved renewal extension",
    });
    expect(record).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reviewed mapping (JSON)"), {
      target: { value: JSON.stringify({ schemaVersion: "artifact-field-map/v1" }) },
    });
    fireEvent.click(
      within(family).getByRole("button", {
        name: "Record mapping for Approved renewal extension",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /mapping recorded \(Preview only until approved\)/,
      ),
    );
    const put = calls.find((call) => call.method === "PUT");
    expect(put?.body).toMatchObject({
      kind: "renewal_extension",
      expectedRevision: 1,
      fieldMap: { schemaVersion: "artifact-field-map/v1" },
    });
    expect(calls.every((call) => ["GET", "POST", "PUT"].includes(call.method))).toBe(
      true,
    );
    expect(document.body.textContent).not.toMatch(
      /prefilled|autofilled|uploaded to Dotloop|\bsigned\b/i,
    );
  });
  it("reads a static original's page positions and adds its pages to the mapping (AC-S130-3)", async () => {
    const staticEntry: ArtifactIntakeEntry = {
      ...received,
      classification: {
        ...received.classification!,
        format: "static_pdf",
        hasAcroForm: false,
      },
    };
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return Response.json({
          staticInspection: {
            kind: "renewal_extension",
            pages: [
              { pageIndex: 0, width: 612, height: 792, rotation: 0, cropBox: null },
              {
                pageIndex: 1,
                width: 612,
                height: 792,
                rotation: 0,
                cropBox: [0, 396, 612, 792],
              },
            ],
            runs: [
              {
                pageIndex: 0,
                x: 72,
                y: 600,
                width: 40.25,
                height: 11,
                text: "SYNTHETIC label",
              },
            ],
            images: [],
            annotations: [
              {
                pageIndex: 0,
                x: 120,
                y: 596,
                width: 200,
                height: 16,
                subtype: "FreeText",
              },
            ],
            truncated: false,
          },
        });
      }),
    );
    const manifest = withEntry(staticEntry);
    render(
      <LeaseArtifactIntakePanel
        initial={{ manifest, checkpoints: checkpoints(manifest) }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Read page positions for/ }));
    await screen.findByText(/Page 1: 612\.0 × 792\.0/);
    expect(urls).toEqual([
      "/api/admin/lease-artifact-intake/inspect?kind=renewal_extension",
    ]);
    expect(
      screen.getByText(/x 72\.0 y 600\.0 w 40\.3 h 11\.0 SYNTHETIC label/),
    ).toBeInTheDocument();
    // The visible area of a cropped page and every annotation are shown for region review.
    expect(
      screen.getByText(
        /Page 2: 612\.0 × 792\.0, visible from x 0\.0 to 612\.0, y 396\.0 to 792\.0/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 annotation is present; a region may not cover it\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/p1 x 120\.0 y 596\.0 w 200\.0 h 16\.0 FreeText/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Add these pages to the mapping" }),
    );
    const mapping = JSON.parse(
      (screen.getByLabelText("Reviewed mapping (JSON)") as HTMLTextAreaElement).value,
    );
    expect(mapping.static).toEqual({
      pages: [
        { pageIndex: 0, width: 612, height: 792, rotation: 0, cropBox: null },
        {
          pageIndex: 1,
          width: 612,
          height: 792,
          rotation: 0,
          cropBox: [0, 396, 612, 792],
        },
      ],
      regions: [],
      protectedRegions: [],
    });
    // Nothing was saved: the only request was the read-only inspection.
    expect(urls).toHaveLength(1);
  });
});
