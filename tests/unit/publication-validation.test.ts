import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakePublicationScanner } from "@/lib/publication/scanners";
import type {
  PublicationEnvelope,
  PublicationPolicyRecord,
} from "@/lib/publication/types";
import {
  PublicationValidationError,
  validatePublication,
} from "@/lib/publication/validation";

const editor: AuthenticatedUser = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-1",
};

describe("publication validation", () => {
  it("refuses oversize metadata before loading or scanning the body", async () => {
    const loadContent = vi.fn(async () => bytes("never load"));
    const scanner = new FakePublicationScanner();
    const envelope = fileEnvelope({
      declaredByteSize: 2 * 1024 * 1024 + 1,
      loadContent,
    });

    await expect(
      validatePublication(editor, policy(), envelope, scanner),
    ).rejects.toMatchObject({
      code: "oversize",
    });
    expect(loadContent).not.toHaveBeenCalled();
  });

  it.each([
    ["path traversal", { path: "../outside.md" }, "path_outside_root"],
    ["absolute path", { path: "C:\\outside.md" }, "path_outside_root"],
    ["denied extension", { fileName: "payload.exe" }, "type_denied"],
    ["wrong root", { rootId: "other-root" }, "root_mismatch"],
    ["wrong Space", { spaceId: "owner-email" }, "space_not_allowed"],
  ])("fails safely for %s", async (_label, metadata, code) => {
    await expect(
      validatePublication(
        editor,
        policy(),
        fileEnvelope({ metadata }),
        new FakePublicationScanner(),
      ),
    ).rejects.toMatchObject({ code });
  });

  it("detects a PDF body disguised as Markdown", async () => {
    await expect(
      validatePublication(
        editor,
        policy(),
        fileEnvelope({ content: "%PDF-fixture-polyglot" }),
        new FakePublicationScanner(),
      ),
    ).rejects.toMatchObject({ code: "mime_mismatch" });
  });

  it.each([
    [
      "scanner outage",
      new FakePublicationScanner("fake-clean-v1", {
        malware: { code: "scanner_unavailable" },
      }),
      "scanner_unavailable",
    ],
    [
      "malware",
      new FakePublicationScanner("fake-clean-v1", {
        malware: { code: "malware_detected" },
      }),
      "malware_detected",
    ],
    [
      "credential/sensitive content",
      new FakePublicationScanner("fake-clean-v1", {
        sensitivity: { code: "sensitivity_violation" },
      }),
      "sensitivity_violation",
    ],
  ])("fails closed for %s without echoing content", async (_label, scanner, code) => {
    const secretFixture = "fixture-secret-that-must-not-echo";
    let caught: unknown;
    try {
      await validatePublication(
        editor,
        policy(),
        fileEnvelope({ content: secretFixture }),
        scanner,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PublicationValidationError);
    expect(caught).toMatchObject({ code });
    expect((caught as Error).message).not.toContain(secretFixture);
  });
});

function policy(): PublicationPolicyRecord {
  return {
    id: "policy-1",
    allowedSpaces: ["lease-renewals"],
    allowedTypes: [
      { extension: ".md", maxBytes: 2 * 1024 * 1024, mimeTypes: ["text/markdown"] },
    ],
    connectorId: "connector-1",
    createdAt: "2026-07-14T00:00:00.000Z",
    createdByUid: "admin-1",
    enabled: true,
    rootId: "root-1",
    scannerKey: "fake-clean-v1",
    sensitivityCeiling: "Medium",
    updatedAt: "2026-07-14T00:00:00.000Z",
    updatedByUid: "admin-1",
  };
}

function fileEnvelope(
  options: {
    content?: string;
    declaredByteSize?: number;
    loadContent?: () => Promise<Uint8Array>;
    metadata?: Partial<PublicationEnvelope["metadata"]>;
  } = {},
): PublicationEnvelope {
  const content = bytes(options.content ?? "# Fixture source");
  return {
    loadContent: options.loadContent ?? (async () => content),
    metadata: {
      citationLabel: "Fixture citation",
      connectorId: "connector-1",
      declaredByteSize: options.declaredByteSize ?? content.byteLength,
      declaredMimeType: "text/markdown",
      detectedMimeType: "text/markdown",
      fileName: "fixture.md",
      path: "sources/fixture.md",
      resourceId: "source:fixture",
      resourceType: "file",
      rootId: "root-1",
      sourceState: "Verified Source",
      spaceId: "lease-renewals",
      ...options.metadata,
    },
  };
}

function bytes(value: string) {
  return new TextEncoder().encode(value);
}
