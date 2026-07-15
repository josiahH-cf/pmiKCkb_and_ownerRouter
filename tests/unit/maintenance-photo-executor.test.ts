import { describe, expect, it, vi } from "vitest";

import type { ExternalActionInput } from "@/lib/external-execution/types";
import { MaintenancePhotoExecutor } from "@/lib/maintenance/execution/providers";
import { syntheticExternalTechnicalGates } from "@/tests/helpers/external-execution";

const CONTENT_HASH = "a".repeat(64);
const base = {
  workflowId: "ticket-synthetic",
  actionId: "photo-1",
  actionKey: "google_drive.maintenance_photo.store",
  values: {
    ticket_ref: "ticket-synthetic",
    folder_ref: "folder-synthetic",
    server_filename: "ticket-synthetic/photo-1.jpg",
    mime_type: "image/jpeg",
    size_bytes: 1000,
    content_hash: CONTENT_HASH,
    assigned_ticket: true,
    malware_scan_passed: true,
    sensitivity_scan_passed: true,
    append_only: true,
  },
  sourceRefs: ["source:synthetic"],
  mappingRef: "mapping:ticket-folder:ticket-synthetic:folder-synthetic",
} satisfies ExternalActionInput;

function stored() {
  return {
    fileRef: "file-1",
    folderId: "folder-synthetic",
    filename: "ticket-synthetic/photo-1.jpg",
    contentHash: CONTENT_HASH,
  };
}

describe("Maintenance photo executor", () => {
  it("appends one scanned image to the exact server-derived ticket path", async () => {
    const append = vi.fn().mockResolvedValue(stored());
    const result = await new MaintenancePhotoExecutor({
      append,
      reconcile: vi.fn(),
    }).execute(base);
    expect(result.providerRef).toBe("file-1");
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketRef: "ticket-synthetic",
        folderId: "folder-synthetic",
        filename: "ticket-synthetic/photo-1.jpg",
        contentHash: CONTENT_HASH,
      }),
    );
  });

  it.each([
    { mime_type: "application/pdf" },
    { size_bytes: 20_000_000 },
    { malware_scan_passed: false },
    { sensitivity_scan_passed: false },
    { append_only: false },
    { ticket_ref: "ticket-other" },
    { folder_ref: "folder-other" },
    { server_filename: "../photo-1.jpg" },
    { content_hash: "not-a-sha256" },
    { content_hash: "A".repeat(64) },
  ])("blocks unsafe ticket/folder/path/file state before provider", async (patch) => {
    const append = vi.fn();
    const executor = new MaintenancePhotoExecutor({ append, reconcile: vi.fn() });
    const input = { ...base, values: { ...base.values, ...patch } };
    expect(executor.validate(input)).toBeTruthy();
    await expect(executor.execute(input)).rejects.toBeDefined();
    expect(append).not.toHaveBeenCalled();
  });

  it("rejects traversal-like action segments before provider", async () => {
    const append = vi.fn();
    const executor = new MaintenancePhotoExecutor({ append, reconcile: vi.fn() });
    const input = {
      ...base,
      actionId: "..",
      values: { ...base.values, server_filename: "ticket-synthetic/...jpg" },
    };
    expect(executor.validate(input)).toContain("path-safe");
    await expect(executor.execute(input)).rejects.toBeDefined();
    expect(append).not.toHaveBeenCalled();
  });

  it("requires assignment for a Vendor but not for an authorized staff actor", () => {
    const executor = new MaintenancePhotoExecutor({
      append: vi.fn(),
      reconcile: vi.fn(),
    });
    const staff = {
      ...base,
      values: { ...base.values, assigned_ticket: false },
      authority: {
        actor: { role: "Editor" as const, uid: "editor-synthetic" },
        roleScopeAuthorized: true,
        technical: syntheticExternalTechnicalGates(),
      },
    };
    expect(executor.validate(staff)).toBeNull();
    expect(
      executor.validate({
        ...staff,
        authority: {
          actor: { role: "Vendor" as const, uid: "vendor-synthetic" },
          roleScopeAuthorized: true,
          technical: syntheticExternalTechnicalGates(),
        },
      }),
    ).toContain("assigned");
  });

  it("treats mismatched provider readback as ambiguous", async () => {
    const executor = new MaintenancePhotoExecutor({
      append: vi.fn().mockResolvedValue({ ...stored(), folderId: "folder-other" }),
      reconcile: vi.fn(),
    });
    await expect(executor.execute(base)).rejects.toMatchObject({ code: "ambiguous" });
  });

  it("returns a reconciled receipt for an exact stored-photo match", async () => {
    const reconcile = vi.fn().mockResolvedValue(stored());
    const result = await new MaintenancePhotoExecutor({
      append: vi.fn(),
      reconcile,
    }).reconcile(base);

    expect(result).toMatchObject({ providerRef: "file-1", reconciled: true });
    expect(reconcile).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  });
});
