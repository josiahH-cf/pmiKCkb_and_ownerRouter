"use client";

import { useState } from "react";

import type {
  TestVendorAdminProjection,
  TestVendorAuditProjection,
} from "@/lib/vendor/admin-runtime";

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
  currentStatus?: "pending_setup" | "active" | "disabled";
  currentInviteVersion?: number;
  nextStatus?: "pending_setup";
  nextInviteVersion?: number;
}

export function VendorAdminPanel({
  initialVendors = [],
}: Readonly<{ initialVendors?: TestVendorAdminProjection[] }>) {
  const [reason, setReason] = useState("Exercise the V1 Vendor workflow safely");
  const [preview, setPreview] = useState<ExactPreview | null>(null);
  const [setupLink, setSetupLink] = useState("");
  const [vendors, setVendors] = useState<TestVendorAdminProjection[]>(initialVendors);
  const [regenerateReason, setRegenerateReason] = useState("");
  const [regeneratePreview, setRegeneratePreview] = useState<ExactPreview | null>(null);
  const [resetReason, setResetReason] = useState("");
  const [resetPreview, setResetPreview] = useState<ExactPreview | null>(null);
  const [disableReason, setDisableReason] = useState("");
  const [disablePreview, setDisablePreview] = useState<ExactPreview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [auditByVendor, setAuditByVendor] = useState<
    Record<string, TestVendorAuditProjection[]>
  >({});

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

  async function loadAudit(vendorId: string) {
    setBusy(true);
    setMessage("Loading bodyless Test Vendor lifecycle history.");
    try {
      const response = await fetch(
        `/api/admin/vendors/test/${encodeURIComponent(vendorId)}/audit`,
      );
      const payload = (await response.json().catch(() => null)) as {
        audit?: TestVendorAuditProjection[];
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Test Vendor audit is unavailable.");
      }
      setAuditByVendor((current) => ({
        ...current,
        [vendorId]: payload?.audit ?? [],
      }));
      setMessage("Bodyless Test Vendor lifecycle history loaded.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Test Vendor audit is unavailable.",
      );
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

  async function reviewRegenerateSetup(vendor: TestVendorAdminProjection) {
    try {
      const payload = await post({
        operation: "preview_regenerate_setup",
        vendorId: vendor.vendorId,
        reason: regenerateReason,
      });
      setRegeneratePreview(payload.preview as ExactPreview);
      setResetPreview(null);
      setDisablePreview(null);
      setSetupLink("");
      setMessage("Review the exact one-time setup-link write, then confirm once.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview failed.");
    }
  }

  async function reviewResetAuthentication(vendor: TestVendorAdminProjection) {
    try {
      const payload = await post({
        operation: "preview_reset_authentication",
        vendorId: vendor.vendorId,
        reason: resetReason,
      });
      setResetPreview(payload.preview as ExactPreview);
      setRegeneratePreview(null);
      setDisablePreview(null);
      setSetupLink("");
      setMessage("Review the exact Test Vendor authentication reset, then confirm once.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview failed.");
    }
  }

  async function confirmResetAuthentication() {
    if (!resetPreview) return;
    try {
      const payload = await post({
        operation: "reset_authentication",
        vendorId: resetPreview.vendorId,
        reason: resetReason,
        confirmedPreviewHash: resetPreview.previewHash,
      });
      const setup = payload.setup as { setupLink?: string } | undefined;
      const resetVendor = payload.vendor as TestVendorAdminProjection;
      setSetupLink(setup?.setupLink ?? "");
      setVendors((current) =>
        current.map((vendor) =>
          vendor.vendorId === resetVendor.vendorId ? resetVendor : vendor,
        ),
      );
      setResetPreview(null);
      setDisablePreview(null);
      setResetReason("");
      setMessage(
        "Test Vendor authentication reset. A new one-time setup link is shown below; the app did not deliver it externally.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication reset failed.");
    }
  }

  async function confirmRegenerateSetup() {
    if (!regeneratePreview) return;
    try {
      const payload = await post({
        operation: "regenerate_setup",
        vendorId: regeneratePreview.vendorId,
        reason: regenerateReason,
        confirmedPreviewHash: regeneratePreview.previewHash,
      });
      const setup = payload.setup as { setupLink?: string } | undefined;
      setSetupLink(setup?.setupLink ?? "");
      setRegeneratePreview(null);
      setRegenerateReason("");
      await refresh();
      setMessage(
        "A new one-time Test Vendor setup link is shown below. The app did not deliver it externally.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Regeneration failed.");
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
      setRegeneratePreview(null);
      setResetPreview(null);
      setSetupLink("");
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
              This secret-bearing link is shown only from the confirmed response and is
              not stored, emailed, or otherwise delivered by the app. Open it directly
              now; Firebase consumes the action code once.
            </p>
            <p>
              <strong>
                Never paste, share, copy, save, log, or send this link. It disappears from
                this page on refresh or when another setup action begins.
              </strong>
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
          <div className="panel">
            <h4>Lifecycle audit</h4>
            <p className="muted">
              Bodyless action history only. Identity values, reasons, setup links, TOTP
              material, mailbox content, and ticket content are never displayed.
            </p>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void loadAudit(vendor.vendorId)}
              type="button"
            >
              Load lifecycle audit
            </button>
            {auditByVendor[vendor.vendorId] ? (
              auditByVendor[vendor.vendorId].length > 0 ? (
                <ol className="compact-list" aria-label="Test Vendor lifecycle audit">
                  {auditByVendor[vendor.vendorId].map((entry, index) => (
                    <li key={`${entry.createdAt}:${entry.action}:${index}`}>
                      <strong>{entry.action}</strong> · {entry.createdAt} · reason hash:{" "}
                      {entry.reasonRecorded ? "recorded" : "not applicable"} · scope:{" "}
                      {entry.ticketScoped
                        ? "assigned ticket"
                        : entry.mailboxScoped
                          ? "Test mailbox"
                          : "Vendor lifecycle"}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">No lifecycle events are recorded yet.</p>
              )
            ) : null}
          </div>
          {vendor.status === "pending_setup" ? (
            <div className="panel">
              <h4>Replace an expired or closed setup link</h4>
              <p>
                Generate a new one-time Firebase password-setup link only after reviewing
                the exact Test identity effect. The app does not email or deliver the
                link.
              </p>
              <label>
                Setup-link regeneration reason
                <input
                  onChange={(event) => {
                    setRegenerateReason(event.target.value);
                    setRegeneratePreview(null);
                    setResetPreview(null);
                    setDisablePreview(null);
                    setSetupLink("");
                  }}
                  value={regenerateReason}
                />
              </label>
              <button
                className="secondary-button"
                disabled={busy || regenerateReason.trim().length < 3}
                onClick={() => reviewRegenerateSetup(vendor)}
                type="button"
              >
                Review new one-time setup link
              </button>
              {regeneratePreview?.vendorId === vendor.vendorId ? (
                <div
                  className="panel"
                  aria-label="Exact Test Vendor setup-link regeneration confirmation"
                >
                  <p className="eyebrow">Test write · no external delivery</p>
                  <p>
                    <strong>Action:</strong> {regeneratePreview.action}
                  </p>
                  <p>
                    <strong>Target:</strong> {regeneratePreview.target}
                  </p>
                  <p>{regeneratePreview.exactEffect}</p>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={confirmRegenerateSetup}
                    type="button"
                  >
                    Confirm new one-time setup link
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="panel">
            <h4>Reset Test Vendor authentication</h4>
            <p>
              Start the canonical Test Vendor sign-in lifecycle again. This deletes the
              current Firebase principal and creates its replacement with a new Firebase
              UID. Before replacement, it revokes all sessions, invalidates the old
              password, and removes every enrolled TOTP factor.
            </p>
            <p>
              Isolated Test tickets and app-only mailbox data are preserved. The reset
              performs no external delivery or provider call and is never Live evidence.
            </p>
            <label>
              Authentication-reset reason
              <input
                onChange={(event) => {
                  setResetReason(event.target.value);
                  setResetPreview(null);
                  setRegeneratePreview(null);
                  setDisablePreview(null);
                  setSetupLink("");
                }}
                value={resetReason}
              />
            </label>
            <button
              className="secondary-button"
              disabled={busy || resetReason.trim().length < 3}
              onClick={() => reviewResetAuthentication(vendor)}
              type="button"
            >
              Review authentication reset
            </button>
            {resetPreview?.vendorId === vendor.vendorId ? (
              <div
                className="panel"
                aria-label="Exact Test Vendor authentication-reset confirmation"
              >
                <p className="eyebrow">Test identity reset · no external delivery</p>
                <p>
                  <strong>Action:</strong> {resetPreview.action}
                </p>
                <p>
                  <strong>Target:</strong> {resetPreview.target}
                </p>
                <p>
                  <strong>Bound transition:</strong> {resetPreview.currentStatus} · invite
                  version {resetPreview.currentInviteVersion} → {resetPreview.nextStatus}{" "}
                  · invite version {resetPreview.nextInviteVersion}
                </p>
                <p>{resetPreview.exactEffect}</p>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={confirmResetAuthentication}
                  type="button"
                >
                  Confirm authentication reset
                </button>
              </div>
            ) : null}
          </div>
          {vendor.status !== "disabled" ? (
            <>
              <label>
                Disable reason
                <input
                  onChange={(event) => {
                    setDisableReason(event.target.value);
                    setDisablePreview(null);
                    setRegeneratePreview(null);
                    setResetPreview(null);
                    setSetupLink("");
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
