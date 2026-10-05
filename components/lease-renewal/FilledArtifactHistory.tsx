"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { useState } from "react";
import { DownloadLink } from "@/components/ui/DownloadLink";
import type { listDerivedArtifactHistory } from "@/lib/firestore/lease-derived-artifacts";
export function FilledArtifactHistory({ leaseId }: Readonly<{ leaseId: string }>) {
  const [history, setHistory] = useState<Awaited<
    ReturnType<typeof listDerivedArtifactHistory>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function read() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/lease-renewal/filled-artifact?${new URLSearchParams({ leaseId, history: "true" })}`,
        { cache: "no-store" },
      );
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error ?? "Saved document history is unavailable.");
      setHistory(value);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Saved document history is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ui-stack-tight" aria-busy={busy}>
      <button className="secondary-button" type="button" disabled={busy} onClick={read}>
        View saved filled document history
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {history ? (
        <>
          <p>
            Retained versions are audit evidence. A historical download does not approve a
            current packet or authorize an upload.
          </p>
          {history.records.length ? (
            <ul>
              {history.records.map((record) => {
                const query = new URLSearchParams({
                  leaseId,
                  snapshotId: record.snapshotId,
                  artifactId: record.artifactId,
                  derivedId: record.id,
                  historical: "true",
                });
                return (
                  <li key={record.id}>
                    {record.fileName} · {record.preparedAt} ·{" "}
                    {record.approved ? "approved" : "unapproved"}
                    <br />
                    <DownloadLink
                      fileName={record.fileName}
                      href={`/api/lease-renewal/filled-artifact?${query}`}
                    >
                      Download retained filled PDF
                    </DownloadLink>
                    {" · "}
                    <DownloadLink
                      fileName="original-lease.pdf"
                      href={`/api/lease-renewal/filled-artifact?${query}&original=true`}
                    >
                      Download original
                    </DownloadLink>
                    <br />
                    <small>SHA-256: {record.outputHash}</small>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No saved filled documents.</p>
          )}
          {history.bounded ? (
            <p>
              The bounded history shows 100 records. Exact retained links remain readable.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
