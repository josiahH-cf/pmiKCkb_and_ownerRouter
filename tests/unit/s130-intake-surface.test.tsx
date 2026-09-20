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
  it("shows seven pending families and the honest checkpoints with no materials", () => {
    const manifest = withEntry(null);
    render(
      <LeaseArtifactIntakePanel
        initial={{ manifest, checkpoints: checkpoints(manifest) }}
      />,
    );
    const families = document.querySelectorAll("[data-artifact-intake-family]");
    expect(families).toHaveLength(7);
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
});
