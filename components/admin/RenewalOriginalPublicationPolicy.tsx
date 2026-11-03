"use client";
import { useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { Button } from "@/components/ui";
import { LEASE_ARTIFACT_FAMILIES } from "@/lib/lease-documents/artifact-catalog";
import type { LeaseArtifactKind } from "@/lib/lease-documents/packet-types";
import { publicationResourceIdentityText } from "@/lib/publication/resource-identity";
import { MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY } from "@/lib/publication/managed-scanner-config";
import type {
  PublicationPolicyRecord,
  RenewalOriginalPublicationScope,
} from "@/lib/publication/types";

async function sha256(bytes: ArrayBuffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}

/** Hash review sends metadata only. Selecting a local original never publishes its bytes. */
export function RenewalOriginalPublicationPolicy({
  policy,
  onSave,
}: {
  policy?: PublicationPolicyRecord;
  onSave: (policy: PublicationPolicyRecord) => void;
}) {
  const existing =
    policy?.resourceScope?.resourceType === "file" ? policy.resourceScope : null;
  const [connectorId, setConnectorId] = useState(policy?.connectorId ?? "");
  const [rootId, setRootId] = useState(policy?.rootId ?? "");
  const [family, setFamily] = useState<LeaseArtifactKind>(
    existing?.artifactKind ?? "renewal_extension",
  );
  const [review, setReview] = useState<RenewalOriginalPublicationScope | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  function clearReview() {
    setReview(null);
    setConfirmed(false);
  }
  async function inspect(file: File | undefined) {
    clearReview();
    if (!file) return;
    setPending(true);
    try {
      if (!connectorId.trim() || !rootId.trim())
        throw new Error("Enter the managed connector and root before reviewing a file.");
      if (
        !/^[^/\\\u0000-\u001f]+\.pdf$/i.test(file.name) ||
        file.size < 1 ||
        file.size > 2 * 1024 * 1024
      )
        throw new Error("Choose one original PDF up to 2 MiB.");
      if (existing && file.name !== existing.fileName)
        throw new Error(
          "A successor review keeps the exact existing filename and family.",
        );
      const bytes = await file.arrayBuffer();
      const path = `sources/${file.name}`;
      setReview({
        resourceType: "file",
        artifactKind: family,
        fileName: file.name,
        path,
        resourceId: `source:${await sha256(new TextEncoder().encode(publicationResourceIdentityText(connectorId.trim(), rootId.trim(), "lease-renewals", path)).buffer)}`,
        contentHash: await sha256(bytes),
        byteSize: bytes.byteLength,
        reviewedBlankOriginal: true,
        reviewedNoClientData: true,
      });
      setNotice(
        "Exact local file hash loaded. Review every page before recording the blank-source attestation; no file bytes were sent.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The original could not be reviewed.",
      );
    } finally {
      setPending(false);
    }
  }
  async function save() {
    if (!review || !confirmed || reason.trim().length < 8 || pending) return;
    setPending(true);
    try {
      const response = await fetch(
        policy
          ? `/api/admin/publication-policies/${policy.id}`
          : "/api/admin/publication-policies",
        {
          method: policy ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            policy
              ? {
                  resourceScope: review,
                  expectedContentHash: existing?.contentHash,
                  reason: reason.trim(),
                }
              : {
                  resourceScope: review,
                  connectorId: connectorId.trim(),
                  rootId: rootId.trim(),
                  allowedSpaces: ["lease-renewals"],
                  allowedTypes: [
                    {
                      extension: ".pdf",
                      maxBytes: 2 * 1024 * 1024,
                      mimeTypes: ["application/pdf"],
                    },
                  ],
                  scannerKey: MANAGED_RENEWAL_ORIGINAL_SCANNER_KEY,
                  sensitivityCeiling: "Low",
                  reason: reason.trim(),
                },
          ),
        },
      );
      const payload = (await response.json()) as {
        policy?: PublicationPolicyRecord;
        error?: string;
      };
      if (!response.ok || !payload.policy)
        throw new Error(payload.error ?? "The original review was refused.");
      onSave(payload.policy);
      clearReview();
      setReason("");
      setNotice(
        "Exact original review saved and read back. File publication, legal-content approval and map approval remain separate.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The original review was not confirmed. Read current policy before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <details>
      <summary>
        {policy
          ? "Review successor blank renewal original"
          : "Review one blank renewal original for publication"}
      </summary>
      <p>
        Only this exact PDF, family and path in Lease Renewals is covered. Other files,
        folders and Spaces remain unavailable. This review is not legal approval, map
        approval or signing authority.
      </p>
      <p>
        File publication makes bytes active through the existing Space source control;
        publish only when that exact use is authorized. This bounded text check is not
        general DLP or OCR. Review images and every page as part of the exact blank-source
        review.
      </p>
      <label>
        Original connector ID
        <input
          value={connectorId}
          disabled={pending || Boolean(policy)}
          onChange={(event) => {
            setConnectorId(event.target.value);
            clearReview();
          }}
        />
      </label>
      <label>
        Original root ID
        <input
          value={rootId}
          disabled={pending || Boolean(policy)}
          onChange={(event) => {
            setRootId(event.target.value);
            clearReview();
          }}
        />
      </label>
      <label>
        Original form family
        <select
          value={family}
          disabled={pending || Boolean(policy)}
          onChange={(event) => {
            setFamily(event.target.value as LeaseArtifactKind);
            clearReview();
          }}
        >
          {LEASE_ARTIFACT_FAMILIES.map((entry) => (
            <option key={entry.kind} value={entry.kind}>
              {entry.label.replace(/^Approved /, "")}
            </option>
          ))}
        </select>
      </label>
      {existing ? (
        <p>
          Current file: {existing.fileName}. SHA-256: {existing.contentHash}.
        </p>
      ) : null}
      <label>
        Choose original for local hash review
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={pending}
          onChange={(event) => {
            void inspect(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {review ? (
        <>
          <p>
            File: {review.fileName}. Path: {review.path}. Bytes: {review.byteSize}.
            SHA-256: {review.contentHash}.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I reviewed every page of this exact blank renewal original; it contains no
            client/customer or personal record values, and signatures are blank.
          </label>
          <label>
            Original review reason
            <textarea
              value={reason}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button
            disabled={pending || !confirmed || reason.trim().length < 8}
            onClick={() => void save()}
          >
            {policy ? "Save exact original byte review" : "Create exact original policy"}
          </Button>
        </>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </details>
  );
}
