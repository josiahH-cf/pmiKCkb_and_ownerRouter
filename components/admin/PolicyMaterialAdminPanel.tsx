"use client";

import { useState } from "react";

import { Button, Field } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import type { PolicyMaterialVersionRecord } from "@/lib/firestore/lease-renewal-policy-material";
import {
  POLICY_CONTENT_SCHEMA_VERSION,
  POLICY_PRODUCT_LABELS,
} from "@/lib/lease-renewal/policy-content";

const PRODUCT = "rhino" as const;
const STATE_TEXT: Record<PolicyMaterialVersionRecord["state"], string> = {
  pending: "Pending approval (not used)",
  approved: "Approved (the one version in use)",
  rejected: "Rejected (never used)",
  superseded: "Superseded (no longer used)",
};

const EXAMPLE = JSON.stringify(
  {
    schemaVersion: POLICY_CONTENT_SCHEMA_VERSION,
    productKey: PRODUCT,
    version: "2026-09-v1",
    reference: "Citation naming the approved material",
    publicationSource: {
      system: "s21_publication",
      reference: "publication:<published version id>",
      contentHash: "<sha256 of the published content>",
    },
    review: {
      reviewer: "Who reviewed the material",
      reviewedAt: "2026-09-20T00:00:00Z",
      note: "Where it was reviewed",
    },
    effectiveFrom: "2026-09-20",
    applicability: {
      ruleVersion: "rule-v1",
      condition: {
        kind: "fact_equals",
        factKey: "deposit.type",
        expectedValue: "replacement_policy",
      },
    },
    requiredInputs: [
      {
        factKey: "deposit.type",
        label: "Deposit type",
        allowedSourceSystems: ["rentvine"],
      },
    ],
    outputSlots: [
      {
        slotId: "tenant_paragraph",
        channel: "tenant_message",
        text: "Approved wording with {{deposit.type}}.",
      },
    ],
  },
  null,
  2,
);

/**
 * S131 (F11) Admin surface: submits one exact policy material version as pending and lets an
 * approver approve or reject that exact version. Submitting never activates anything; approval
 * enables only the named version and supersedes the previous one. The configuration is
 * engineering scaffolding bound to a trusted publication; it is not the policy, not legal content
 * and never a provider record. Nothing here sends, charges, enrolls or writes to the Sheet.
 */
export function PolicyMaterialAdminPanel({
  initial,
  note,
}: Readonly<{ initial: PolicyMaterialVersionRecord[]; note?: string }>) {
  const [records, setRecords] = useState(initial);
  const [json, setJson] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function call(method: "POST" | "PATCH", body: Record<string, unknown>) {
    setPending(true);
    setError("");
    setOk("");
    try {
      const response = await fetch("/api/admin/policy-material", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        policyMaterial?: { record: PolicyMaterialVersionRecord; duplicate: boolean };
        error?: string;
      };
      if (!response.ok || !payload.policyMaterial?.record) {
        setError(
          payload.error ??
            "The request was refused. Reload and review the current versions.",
        );
        return;
      }
      const list = await fetch("/api/admin/policy-material", { cache: "no-store" })
        .then(async (r) =>
          r.ok
            ? ((await r.json()) as {
                policyMaterial?: { records: PolicyMaterialVersionRecord[] };
              })
            : null,
        )
        .catch(() => null);
      setRecords(
        list?.policyMaterial?.records ?? [
          payload.policyMaterial.record,
          ...records.filter((r) => r.id !== payload.policyMaterial?.record.id),
        ],
      );
      setOk(
        payload.policyMaterial.duplicate
          ? "This request was already recorded; the current state was read back."
          : method === "POST"
            ? `Version ${payload.policyMaterial.record.version} is recorded as pending. It is not used until an approver approves it.`
            : `Version ${payload.policyMaterial.record.version} is now ${payload.policyMaterial.record.state}. The state was read back.`,
      );
      if (method === "POST") setJson("");
      setReason("");
    } catch {
      setError(
        "The request could not be completed. Reload and review the current versions before retrying.",
      );
    } finally {
      setPending(false);
    }
  }

  function submit() {
    let config: unknown;
    try {
      config = JSON.parse(json);
    } catch {
      setError("Enter the configuration as valid JSON.");
      return;
    }
    void call("POST", { config, operationId: crypto.randomUUID() });
  }

  function decide(record: PolicyMaterialVersionRecord, decision: "approve" | "reject") {
    void call("PATCH", {
      productKey: record.product_key,
      version: record.version,
      decision,
      reason: reason.trim(),
      expectedRevision: record.revision,
      operationId: crypto.randomUUID(),
    });
  }

  const approved = records.filter((record) => record.state === "approved");
  return (
    <article className="panel" data-policy-material-panel>
      <h2 className="section-subtitle">
        {POLICY_PRODUCT_LABELS[PRODUCT]} material (S131)
      </h2>
      <p className="muted">
        Submitting records one exact version as pending. Approval enables only that
        version and supersedes the earlier approved one; rejection never touches the
        version in use. The configuration binds a trusted publication by id and content
        hash and declares typed conditions, required inputs and output slots. It is
        engineering scaffolding, not the policy and not legal content. Nothing here writes
        to a provider or the operating Sheet.
      </p>
      {note ? <p className="renewal-notice">{note}</p> : null}
      <p data-policy-material-active>
        In use:{" "}
        {approved.length === 1
          ? `version ${approved[0].version} (revision ${approved[0].revision})`
          : approved.length === 0
            ? "none. Every lease reads Pending approved policy material."
            : "more than one approved version; no version is used until one remains."}
      </p>
      <Field
        htmlFor="policy-material-json"
        label="Configuration (JSON)"
        hint="Paste the reviewed configuration. Unknown fields, unapproved sources, executable content, circular conditions and missing version or binding are refused."
      >
        <textarea
          id="policy-material-json"
          rows={10}
          value={json}
          placeholder={EXAMPLE}
          onChange={(event) => setJson(event.target.value)}
        />
      </Field>
      <Button disabled={pending || !json.trim()} onClick={submit}>
        Submit as pending
      </Button>
      <Field
        htmlFor="policy-material-reason"
        label="Decision reason"
        hint="Required for approve or reject; recorded with the decision."
      >
        <input
          id="policy-material-reason"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {records.length === 0 ? (
        <p>No versions submitted.</p>
      ) : (
        <ul data-policy-material-versions>
          {records.map((record) => (
            <li key={record.id} data-policy-material-state={record.state}>
              <strong>Version {record.version}</strong>: {STATE_TEXT[record.state]}.
              Submitted {formatBusinessTimestamp(record.submitted_at)} by{" "}
              {record.submitted_by_uid}
              {record.decided_at
                ? `; decided ${formatBusinessTimestamp(record.decided_at)} by ${record.decided_by_uid}`
                : ""}
              {record.superseded_by_version
                ? `; superseded by ${record.superseded_by_version}`
                : ""}
              . Reference: {record.config.reference}; rule{" "}
              {record.config.applicability.ruleVersion}.
              {record.state === "pending" ? (
                <>
                  {" "}
                  <Button
                    disabled={pending || !reason.trim()}
                    onClick={() => decide(record, "approve")}
                  >
                    Approve version {record.version}
                  </Button>{" "}
                  <Button
                    disabled={pending || !reason.trim()}
                    onClick={() => decide(record, "reject")}
                  >
                    Reject version {record.version}
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className="renewal-notice" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? <p role="status">{ok}</p> : null}
    </article>
  );
}
