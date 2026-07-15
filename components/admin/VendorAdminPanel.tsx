"use client";

import { useState } from "react";

import type { TestVendorAdminProjection } from "@/lib/vendor/admin-runtime";

interface ExactPreview {
  previewHash: string;
  vendorId: string;
  displayName: string;
  dataMode: "test";
  action: string;
  target: string;
  externalDelivery: false;
  liveEvidenceEligible: false;
  exactEffect: string;
}

export function VendorAdminPanel({
  initialVendors = [],
}: Readonly<{ initialVendors?: TestVendorAdminProjection[] }>) {
  const [reason, setReason] = useState("Exercise the V1 Vendor workflow safely");
  const [preview, setPreview] = useState<ExactPreview | null>(null);
  const [setupLink, setSetupLink] = useState("");
  const [vendors, setVendors] = useState<TestVendorAdminProjection[]>(initialVendors);
  const [disableReason, setDisableReason] = useState("");
  const [disablePreview, setDisablePreview] = useState<ExactPreview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/vendors/test");
    const payload = (await response.json().catch(() => null)) as {
      vendors?: TestVendorAdminProjection[];
      error?: string;
    } | null;
    if (!response.ok) throw new Error(payload?.error ?? "Test Vendors are unavailable.");
    setVendors(payload?.vendors ?? []);
  }

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/vendors/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Vendor action failed.",
        );
      }
      return payload ?? {};
    } finally {
      setBusy(false);
    }
  }

  async function reviewProvision() {
    try {
      const payload = await post({
        operation: "preview_provision",
        aliasKey: "summit-plumbing",
        reason,
      });
      setPreview(payload.preview as ExactPreview);
      setSetupLink("");
      setMessage("Review the exact Test identity write, then confirm once.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview failed.");
    }
  }

  async function provision() {
    if (!preview) return;
    try {
      const payload = await post({
        operation: "provision",
        aliasKey: "summit-plumbing",
        reason,
        confirmedPreviewHash: preview.previewHash,
      });
      const setup = payload.setup as { setupLink?: string } | undefined;
      setSetupLink(setup?.setupLink ?? "");
      setPreview(null);
      await refresh();
      setMessage(
        "Test Vendor created. Open the one-time link now, set its password, then enroll TOTP on first sign-in.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Provisioning failed.");
    }
  }

  async function reviewDisable(vendor: TestVendorAdminProjection) {
    try {
      const payload = await post({
        operation: "preview_disable",
        vendorId: vendor.vendorId,
        reason: disableReason,
      });
      setDisablePreview(payload.preview as ExactPreview);
      setMessage("Review the exact Test Vendor revocation, then confirm once.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview failed.");
    }
  }

  async function confirmDisable() {
    if (!disablePreview) return;
    try {
      await post({
        operation: "disable",
        vendorId: disablePreview.vendorId,
        reason: disableReason,
        confirmedPreviewHash: disablePreview.previewHash,
      });
      setDisablePreview(null);
      setDisableReason("");
      await refresh();
      setMessage("Test Vendor disabled and Firebase sessions revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Disable failed.");
    }
  }

  const canonicalExists = vendors.some(
    (vendor) => vendor.vendorId === "vendor:test-summit-plumbing",
  );

  return (
    <article className="panel">
      <p className="eyebrow">Production Test workspace</p>
      <h2>External Vendors</h2>
      <p>
        Provision the canonical non-routable Test Vendor to use the real Firebase
        password/TOTP, assignment, disable/revoke, and portal lifecycle. Test mailbox
        writes stay inside the app and never count as live-provider evidence.
      </p>

      <div className="panel">
        <h3>Summit Plumbing Test Vendor</h3>
        <p className="mono">service@summit-plumbing.example.invalid</p>
        <p>
          Email is pre-verified only because <code>.invalid</code> cannot receive mail.
          TOTP remains mandatory before a Vendor session is issued.
        </p>
        <label>
          Provisioning reason
          <textarea
            disabled={canonicalExists}
            onChange={(event) => {
              setReason(event.target.value);
              setPreview(null);
            }}
            value={reason}
          />
        </label>
        <button
          className="secondary-button"
          disabled={busy || canonicalExists || reason.trim().length < 3}
          onClick={reviewProvision}
          type="button"
        >
          Review exact Test setup
        </button>
        {preview ? (
          <div className="panel" aria-label="Exact Test Vendor setup confirmation">
            <p className="eyebrow">Test write · no external delivery</p>
            <p>
              <strong>Action:</strong> {preview.action}
            </p>
            <p>
              <strong>Target:</strong> {preview.target}
            </p>
            <p>{preview.exactEffect}</p>
            <button
              className="primary-button"
              disabled={busy}
              onClick={provision}
              type="button"
            >
              Confirm and provision Test Vendor
            </button>
          </div>
        ) : null}
        {setupLink ? (
          <div className="panel" role="alert">
            <h3>One-time password setup link</h3>
            <p>
              This secret-bearing link is shown only in this response and is not stored or
              emailed. Open it now; Firebase consumes the action code once.
            </p>
            <a href={setupLink} rel="noreferrer" target="_blank">
              Open one-time Test Vendor setup
            </a>
          </div>
        ) : null}
      </div>

      {vendors.map((vendor) => (
        <div className="panel" key={vendor.vendorId}>
          <p className="eyebrow">Test data · {vendor.status}</p>
          <h3>{vendor.displayName}</h3>
          <p>{vendor.email}</p>
          <p>
            Email verified: {vendor.emailVerified ? "yes" : "no"} · TOTP verified:{" "}
            {vendor.totpVerified ? "yes" : "not yet"}
          </p>
          {vendor.status !== "disabled" ? (
            <>
              <label>
                Disable reason
                <input
                  onChange={(event) => {
                    setDisableReason(event.target.value);
                    setDisablePreview(null);
                  }}
                  value={disableReason}
                />
              </label>
              <button
                disabled={busy || disableReason.trim().length < 3}
                onClick={() => reviewDisable(vendor)}
                type="button"
              >
                Review Test Vendor disable
              </button>
            </>
          ) : null}
        </div>
      ))}

      {disablePreview ? (
        <div className="panel" aria-label="Exact Test Vendor disable confirmation">
          <p className="eyebrow">Test identity revocation</p>
          <p>
            <strong>Target:</strong> {disablePreview.target}
          </p>
          <p>{disablePreview.exactEffect}</p>
          <button
            className="primary-button"
            disabled={busy}
            onClick={confirmDisable}
            type="button"
          >
            Confirm disable and revoke
          </button>
        </div>
      ) : null}

      <p className="muted" role="status">
        {message}
      </p>
      <p className="muted">
        Live Vendors retain the stricter contract: verified routable email, TOTP,
        same-address OAuth, assigned-ticket-only access, and exact confirmation for
        replies.
      </p>
    </article>
  );
}
