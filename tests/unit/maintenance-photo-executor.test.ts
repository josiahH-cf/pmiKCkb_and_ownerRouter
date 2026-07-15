import { describe, expect, it, vi } from "vitest";

import { MaintenancePhotoExecutor } from "@/lib/maintenance/execution/providers";

const base = {
  workflowId: "ticket-1",
  actionId: "photo-1",
  actionKey: "google_drive.maintenance_photo.store",
  values: {
    ticket_ref: "ticket-synthetic",
    folder_ref: "folder-synthetic",
    server_filename: "ticket-synthetic/photo-1.jpg",
    mime_type: "image/jpeg",
    size_bytes: 1000,
    assigned_ticket: true,
    malware_scan_passed: true,
    sensitivity_scan_passed: true,
    append_only: true,
  },
  sourceRefs: ["source:synthetic"],
};

describe("Maintenance photo executor", () => {
  it("appends one scanned assigned-ticket image", async () => {
    const append = vi.fn().mockResolvedValue({ fileRef: "file-1" });
    const result = await new MaintenancePhotoExecutor({
      append,
      reconcile: vi.fn(),
    }).execute(base);
    expect(result.providerRef).toBe("file-1");
    expect(append).toHaveBeenCalledTimes(1);
  });

  it.each([
    { mime_type: "application/pdf" },
    { size_bytes: 20_000_000 },
    { assigned_ticket: false },
    { malware_scan_passed: false },
    { sensitivity_scan_passed: false },
    { append_only: false },
  ])("blocks unsafe file/folder/scanner state before bytes/provider", async (patch) => {
    const append = vi.fn();
    await expect(
      new MaintenancePhotoExecutor({ append, reconcile: vi.fn() }).execute({
        ...base,
        values: { ...base.values, ...patch },
      }),
    ).rejects.toBeDefined();
    expect(append).not.toHaveBeenCalled();
  });
});
