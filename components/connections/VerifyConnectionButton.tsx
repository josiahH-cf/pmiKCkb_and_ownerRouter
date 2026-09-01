"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LiveRegion, Notice } from "@/components/ui";

// Admin-only "Verify connection" (S13 D5): asks the server to re-run this connector's read-only
// live probe fresh, then refreshes so the card shows the new verdict. Verifies only — never writes.
export function VerifyConnectionButton({
  connectorId,
  connectorName,
}: Readonly<{ connectorId: string; connectorName: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    kind: "verified" | "failed" | "transport";
    message: string;
  } | null>(null);

  async function verify() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/connections/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connector_id: connectorId }),
      });
      if (!response.ok) {
        await response.json().catch(() => null);
        setResult({ kind: "transport", message: "The check could not run" });
        return;
      }
      const body = (await response.json()) as unknown;
      if (!isExactVerificationResult(body, connectorId)) {
        setResult({ kind: "transport", message: "The check could not run" });
        return;
      }
      setResult(
        body.verified
          ? {
              kind: "verified",
              message: `Verified: ${connectorName} answered the live check.`,
            }
          : {
              kind: "failed",
              message: `${connectorName} did not pass the live check. See the card's next step.`,
            },
      );
      router.refresh();
    } catch {
      setResult({ kind: "transport", message: "The check could not run" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-stack-tight">
      <LiveRegion message={busy ? `Checking ${connectorName}…` : ""} />
      <Button
        busy={busy}
        busyLabel={`Checking ${connectorName}…`}
        onClick={verify}
        state={result?.kind === "verified" ? "success" : result ? "error" : "idle"}
      >
        Check {connectorName} connection
      </Button>
      {result ? (
        <Notice
          tone={
            result.kind === "verified"
              ? "success"
              : result.kind === "failed"
                ? "caution"
                : "error"
          }
        >
          {result.message}
        </Notice>
      ) : null}
    </div>
  );
}

function isExactVerificationResult(
  value: unknown,
  connectorId: string,
): value is { connector_id: string; verified: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.connector_id === connectorId &&
    typeof record.verified === "boolean"
  );
}
