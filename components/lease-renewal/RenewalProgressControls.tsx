"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field } from "@/components/ui";

// Phase-A LIVE workspace controls that make the renewal flow move. They persist the operator's own
// forward progress through /api/lease-renewal/renewal-progress and refresh the server-rendered workspace.
// They change NO system of record: RentVine and the Sheet stay read-only; recording a decision here does
// not compose or send anything. The tenant offer is drafted only through the gated Gmail composer.

type OwnerDecision = "keep_same" | "increase" | "custom";

interface RecordedDecision {
  decision: OwnerDecision;
  offeredRent: number;
  charges?: { rbp?: number; insurance?: number };
  infoFormUrl?: string;
  market?: {
    zillowLow?: number;
    zillowHigh?: number;
    pmiNumber?: number;
    compsUrl?: string;
    compScreenshotRef?: string;
    compSource?: string;
    compRetrievedAt?: string;
  };
}

/** A DISPLAY-only comp lookup result (mirrors the server MarketCompResult). Never bound to offeredRent. */
interface CompLookup {
  rangeLow?: number;
  rangeHigh?: number;
  pointEstimate?: number;
  compCount?: number;
  source: string;
  retrievedAt?: string;
  confidence: "Likely" | "Needs Verification";
}

interface ScreenshotReceipt {
  executionId: string;
  ref: string;
}

interface ScreenshotPreview {
  executionId: string;
  previewHash: string;
  expiresAt?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface ScreenshotRollbackPreview {
  rollbackId: string;
  previewHash: string;
  expiresAt: string;
  providerDriftedSinceReceipt: boolean;
  targetRef: string;
  targetLabel: string;
}

const OWNER_DECISIONS: { value: OwnerDecision; label: string }[] = [
  { value: "increase", label: "Increase rent" },
  { value: "keep_same", label: "Keep the same rent" },
  { value: "custom", label: "Custom" },
];

/** Format a whole/decimal dollar amount with thousands separators (client-side reference display). */
function formatMoney(amount: number): string {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return "$" + fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Read a File into base64 (no data: prefix), for the comp-screenshot upload. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

function screenshotMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic" || extension === "heif") return "image/heic";
  return "application/octet-stream";
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1_024) return `${sizeBytes} bytes`;
  return `${(sizeBytes / 1_024).toFixed(1)} KiB`;
}

/**
 * Record (or update) the owner's rent decision for a live lease. Recording advances the lease to the
 * Tenant-offer step and builds the tenant offer from these numbers. The decision + charges are the
 * operator's inputs; the recipient and lease facts stay sourced from RentVine on the draft side.
 */
export function OwnerDecisionForm({
  leaseId,
  current,
  address,
  compScreenshotExecutable = false,
}: Readonly<{
  leaseId: string;
  current: RecordedDecision | null;
  /** The in-boundary property address, used only for the reference-only comp lookup (never PII/rent). */
  address?: string;
  /** Server-owned committed Action Registry projection. Direct client renders fail closed. */
  compScreenshotExecutable?: boolean;
}>) {
  const router = useRouter();
  const [decision, setDecision] = useState<OwnerDecision>(
    current?.decision ?? "increase",
  );
  const [offeredRent, setOfferedRent] = useState(
    current ? String(current.offeredRent) : "",
  );
  const [infoFormUrl, setInfoFormUrl] = useState(current?.infoFormUrl ?? "");
  const [rbp, setRbp] = useState(
    current?.charges?.rbp !== undefined ? String(current.charges.rbp) : "",
  );
  const [insurance, setInsurance] = useState(
    current?.charges?.insurance !== undefined ? String(current.charges.insurance) : "",
  );
  const [zillowLow, setZillowLow] = useState(
    current?.market?.zillowLow !== undefined ? String(current.market.zillowLow) : "",
  );
  const [zillowHigh, setZillowHigh] = useState(
    current?.market?.zillowHigh !== undefined ? String(current.market.zillowHigh) : "",
  );
  const [pmiNumber, setPmiNumber] = useState(
    current?.market?.pmiNumber !== undefined ? String(current.market.pmiNumber) : "",
  );
  const [compScreenshotRef, setCompScreenshotRef] = useState(
    current?.market?.compScreenshotRef ?? "",
  );
  const [screenshotStatus, setScreenshotStatus] = useState("");
  const [screenshotPending, setScreenshotPending] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<ScreenshotPreview | null>(
    null,
  );
  const [screenshotExecutionId, setScreenshotExecutionId] = useState("");
  const screenshotHydratedLease = useRef<string | null>(null);
  const [rollbackRecoveryPending, setRollbackRecoveryPending] = useState(false);
  const [rollbackPreview, setRollbackPreview] =
    useState<ScreenshotRollbackPreview | null>(null);
  const [compLookup, setCompLookup] = useState<CompLookup | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const id = {
    decision: useId(),
    rent: useId(),
    form: useId(),
    rbp: useId(),
    insurance: useId(),
    zillowLow: useId(),
    zillowHigh: useId(),
    pmiNumber: useId(),
    screenshot: useId(),
  };

  // Reference-only market-comp lookup: runs the configured provider (the manual adapter echoes the
  // operator's own numbers; RentCast is refused until its gate flips) and DISPLAYS the range. It never
  // sets the offered rent — the comp-derived SUGGESTED number is the separate Admin-gated S29.
  async function lookupComps() {
    setLookupPending(true);
    try {
      const manualBasis: Record<string, number> = {};
      if (zillowLow.trim() !== "") manualBasis.zillowLow = Number(zillowLow);
      if (zillowHigh.trim() !== "") manualBasis.zillowHigh = Number(zillowHigh);
      if (pmiNumber.trim() !== "") manualBasis.pmiNumber = Number(pmiNumber);
      const response = await fetch("/api/lease-renewal/market-comps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: (address ?? "").trim() || "Unknown",
          ...(Object.keys(manualBasis).length > 0 ? { manualBasis } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as CompLookup & {
        error?: string;
      };
      setCompLookup(response.ok ? payload : null);
    } catch {
      setCompLookup(null);
    } finally {
      setLookupPending(false);
    }
  }

  useEffect(() => {
    if (screenshotExecutionId || screenshotHydratedLease.current === leaseId) {
      return;
    }
    screenshotHydratedLease.current = leaseId;
    const controller = new AbortController();
    void fetch(
      `/api/lease-renewal/comp-screenshot?operation=status&leaseId=${encodeURIComponent(leaseId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          status?: string;
          executionId?: string;
          receipt?: ScreenshotReceipt;
          reason?: string;
        };
        if (
          response.ok &&
          payload.status === "delivered" &&
          payload.executionId &&
          payload.receipt?.ref
        ) {
          setCompScreenshotRef(payload.receipt.ref);
          setScreenshotExecutionId(payload.executionId);
          setRollbackRecoveryPending(false);
        } else if (response.ok && payload.status === "rolled_back") {
          setCompScreenshotRef("");
          setScreenshotExecutionId("");
          setRollbackRecoveryPending(false);
          setRollbackPreview(null);
          setScreenshotStatus("Screenshot removal was already verified.");
        } else if (
          response.ok &&
          payload.executionId &&
          (payload.status === "rollback_running" ||
            payload.status === "rollback_ambiguous")
        ) {
          setCompScreenshotRef("");
          setScreenshotExecutionId(payload.executionId);
          setRollbackRecoveryPending(true);
          setScreenshotStatus(
            payload.reason ??
              "Screenshot removal needs recovery before this attachment can be treated as delivered.",
          );
        } else if (
          response.ok &&
          payload.executionId &&
          ["claimed", "id_reserved", "upload_started", "ambiguous"].includes(
            payload.status ?? "",
          )
        ) {
          setScreenshotExecutionId(payload.executionId);
          setScreenshotStatus(
            payload.reason ??
              "An exact screenshot attempt needs recovery. Check it before reselecting the same file.",
          );
        } else if (
          response.ok &&
          (payload.status === "absent" || payload.status === "failed")
        ) {
          setScreenshotStatus(
            payload.reason ??
              "The prior screenshot attempt created no verified Drive file. You may prepare it again.",
          );
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [leaseId, screenshotExecutionId]);

  function selectScreenshot(file: File | undefined) {
    setSelectedScreenshot(file ?? null);
    setScreenshotPreview(null);
    setScreenshotStatus(
      file ? "Selected locally. Review the exact file before any Drive upload." : "",
    );
  }

  async function prepareScreenshot() {
    const file = selectedScreenshot;
    if (!file) return;
    setScreenshotPending(true);
    setScreenshotStatus("");
    try {
      const base64 = await fileToBase64(file);
      const resuming = screenshotExecutionId !== "" && compScreenshotRef === "";
      const response = await fetch("/api/lease-renewal/comp-screenshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          resuming
            ? {
                operation: "resume",
                leaseId,
                executionId: screenshotExecutionId,
                filename: file.name,
                mimeType: screenshotMimeType(file),
                base64,
              }
            : {
                operation: "store",
                confirm: false,
                leaseId,
                filename: file.name,
                mimeType: screenshotMimeType(file),
                base64,
              },
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        status?: string;
        preview?: {
          executionId?: string;
          previewHash?: string;
          expiresAt?: string;
        };
        file?: {
          filename?: string;
          mimeType?: string;
          sizeBytes?: number;
        };
        executionId?: string;
        receipt?: ScreenshotReceipt;
        reason?: string;
        error?: string;
      };
      if (
        response.ok &&
        (payload.status === "preview" || payload.status === "resume") &&
        payload.preview?.executionId &&
        payload.preview.previewHash &&
        (payload.status === "resume" || payload.preview.expiresAt) &&
        payload.file?.filename &&
        payload.file.mimeType &&
        typeof payload.file.sizeBytes === "number"
      ) {
        setScreenshotPreview({
          executionId: payload.preview.executionId,
          previewHash: payload.preview.previewHash,
          expiresAt: payload.preview.expiresAt,
          filename: payload.file.filename,
          mimeType: payload.file.mimeType,
          sizeBytes: payload.file.sizeBytes,
        });
        setScreenshotStatus(
          payload.status === "resume"
            ? "Exact prior attempt recovered. Confirm to retry only its reserved Drive file id."
            : "Preview ready. Confirm to create exactly one receipted Drive file.",
        );
      } else if (
        response.ok &&
        payload.status === "existing" &&
        payload.executionId &&
        payload.receipt?.ref
      ) {
        setCompScreenshotRef(payload.receipt.ref);
        setScreenshotExecutionId(payload.executionId);
        setSelectedScreenshot(null);
        setScreenshotPreview(null);
        setRollbackRecoveryPending(false);
        setScreenshotStatus(
          payload.reason ??
            "This renewal already has a verified screenshot. Remove it before storing a replacement.",
        );
      } else if (
        response.ok &&
        payload.executionId &&
        (payload.status === "in_progress" || payload.status === "ambiguous")
      ) {
        setScreenshotExecutionId(payload.executionId);
        setScreenshotPreview(null);
        setRollbackRecoveryPending(false);
        setScreenshotStatus(
          payload.reason ??
            "An exact screenshot attempt already owns this slot. Review the reselected file to recover it.",
        );
      } else {
        setScreenshotStatus(
          payload.error ?? "Could not prepare the screenshot. Continue without one.",
        );
      }
    } catch {
      setScreenshotStatus("Could not reach the screenshot service.");
    } finally {
      setScreenshotPending(false);
    }
  }

  async function confirmScreenshot() {
    const file = selectedScreenshot;
    const preview = screenshotPreview;
    if (!file || !preview) return;
    setScreenshotPending(true);
    setScreenshotStatus("");
    try {
      const base64 = await fileToBase64(file);
      const response = await fetch("/api/lease-renewal/comp-screenshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "store",
          confirm: true,
          leaseId,
          filename: file.name,
          mimeType: screenshotMimeType(file),
          base64,
          executionId: preview.executionId,
          previewHash: preview.previewHash,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        status?: string;
        executionId?: string;
        receipt?: ScreenshotReceipt;
        error?: string;
        reason?: string;
      };
      if (
        response.ok &&
        payload.status === "delivered" &&
        payload.executionId &&
        payload.receipt?.ref
      ) {
        setCompScreenshotRef(payload.receipt.ref);
        setScreenshotExecutionId(payload.executionId);
        setRollbackRecoveryPending(false);
        setScreenshotPreview(null);
        setSelectedScreenshot(null);
        setScreenshotStatus("Screenshot stored with a verified Drive receipt.");
      } else {
        if (payload.executionId) setScreenshotExecutionId(payload.executionId);
        setScreenshotStatus(
          payload.error ??
            payload.reason ??
            "Drive delivery is not yet verified. Check the exact attempt.",
        );
      }
    } catch {
      setScreenshotStatus(
        "The response was lost. Check the exact attempt before trying anything new.",
      );
      setScreenshotExecutionId(preview.executionId);
    } finally {
      setScreenshotPending(false);
    }
  }

  async function reconcileScreenshot() {
    if (!screenshotExecutionId) return;
    setScreenshotPending(true);
    setScreenshotStatus("");
    try {
      const response = await fetch(
        `/api/lease-renewal/comp-screenshot?operation=reconcile&executionId=${encodeURIComponent(screenshotExecutionId)}`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        status?: string;
        receipt?: ScreenshotReceipt;
        error?: string;
        reason?: string;
      };
      if (response.ok && payload.status === "delivered" && payload.receipt?.ref) {
        setCompScreenshotRef(payload.receipt.ref);
        setRollbackRecoveryPending(false);
        setScreenshotPreview(null);
        setSelectedScreenshot(null);
        setScreenshotStatus("Drive receipt recovered.");
      } else {
        setScreenshotStatus(
          payload.error ??
            payload.reason ??
            "Drive still cannot verify this exact attempt.",
        );
      }
    } catch {
      setScreenshotStatus("Could not check the Drive receipt.");
    } finally {
      setScreenshotPending(false);
    }
  }

  async function prepareScreenshotRollback() {
    if (!screenshotExecutionId) return;
    setScreenshotPending(true);
    setScreenshotStatus("");
    try {
      const response = await fetch("/api/lease-renewal/comp-screenshot/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "trash",
          confirm: false,
          leaseId,
          executionId: screenshotExecutionId,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        status?: string;
        preview?: {
          rollbackId?: string;
          previewHash?: string;
          expiresAt?: string;
          providerDriftedSinceReceipt?: boolean;
        };
        target?: {
          ref?: string;
          targetLabel?: string;
        };
        error?: string;
      };
      if (
        response.ok &&
        payload.status === "preview" &&
        payload.preview?.rollbackId &&
        payload.preview.previewHash &&
        payload.preview.expiresAt &&
        payload.target?.ref &&
        payload.target.targetLabel
      ) {
        setRollbackPreview({
          rollbackId: payload.preview.rollbackId,
          previewHash: payload.preview.previewHash,
          expiresAt: payload.preview.expiresAt,
          providerDriftedSinceReceipt:
            payload.preview.providerDriftedSinceReceipt ?? false,
          targetRef: payload.target.ref,
          targetLabel: payload.target.targetLabel,
        });
        setScreenshotStatus(
          payload.preview.providerDriftedSinceReceipt
            ? "Drive metadata changed since storage. Review and confirm the exact receipted file."
            : "Removal preview ready. Confirm to move only this receipted file to Drive trash.",
        );
      } else {
        setScreenshotStatus(payload.error ?? "Could not prepare screenshot removal.");
      }
    } catch {
      setScreenshotStatus("Could not reach the screenshot removal service.");
    } finally {
      setScreenshotPending(false);
    }
  }

  async function confirmScreenshotRollback() {
    if (!screenshotExecutionId || !rollbackPreview) return;
    setScreenshotPending(true);
    setScreenshotStatus("");
    try {
      const response = await fetch("/api/lease-renewal/comp-screenshot/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "trash",
          confirm: true,
          leaseId,
          executionId: screenshotExecutionId,
          rollbackId: rollbackPreview.rollbackId,
          previewHash: rollbackPreview.previewHash,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
        reason?: string;
      };
      if (response.ok && payload.status === "rolled_back") {
        setCompScreenshotRef("");
        setScreenshotExecutionId("");
        setRollbackRecoveryPending(false);
        setRollbackPreview(null);
        setScreenshotStatus(
          "Screenshot moved to Drive trash and the trashed state was verified.",
        );
      } else {
        if (response.ok && payload.status === "ambiguous") {
          setCompScreenshotRef("");
          setRollbackRecoveryPending(true);
          setRollbackPreview(null);
        } else if (response.ok && payload.status === "failed") {
          setRollbackRecoveryPending(false);
          setRollbackPreview(null);
        }
        setScreenshotStatus(
          payload.error ?? payload.reason ?? "Drive has not yet verified the removal.",
        );
      }
    } catch {
      setCompScreenshotRef("");
      setRollbackRecoveryPending(true);
      setRollbackPreview(null);
      setScreenshotStatus(
        "The removal response was lost. Reuse this exact confirmation to recover it.",
      );
    } finally {
      setScreenshotPending(false);
    }
  }

  const ready = offeredRent.trim() !== "" && Number(offeredRent) > 0;

  async function submit() {
    setPending(true);
    setError("");
    setSaved(false);
    const charges: { rbp?: number; insurance?: number } = {};
    if (rbp.trim() !== "") charges.rbp = Number(rbp);
    if (insurance.trim() !== "") charges.insurance = Number(insurance);
    const body: Record<string, unknown> = {
      action: "owner_decision",
      leaseId,
      decision,
      offeredRent: Number(offeredRent),
    };
    if (charges.rbp !== undefined || charges.insurance !== undefined) {
      body.charges = charges;
    }
    if (infoFormUrl.trim() !== "") body.infoFormUrl = infoFormUrl.trim();
    const market: Record<string, unknown> = {};
    if (zillowLow.trim() !== "") market.zillowLow = Number(zillowLow);
    if (zillowHigh.trim() !== "") market.zillowHigh = Number(zillowHigh);
    if (pmiNumber.trim() !== "") market.pmiNumber = Number(pmiNumber);
    // The server attaches a screenshot only from its durable successful receipt. Never trust or send
    // a client-supplied Drive reference as renewal progress.
    if (compLookup?.source) market.compSource = compLookup.source;
    if (compLookup?.retrievedAt) market.compRetrievedAt = compLookup.retrievedAt;
    if (Object.keys(market).length > 0) body.market = market;
    try {
      const response = await fetch("/api/lease-renewal/renewal-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setSaved(true);
        router.refresh();
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not record the decision.");
      }
    } catch {
      setError("Could not reach the renewal service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-stack">
      <Field htmlFor={id.decision} label="Owner decision" required>
        <select
          id={id.decision}
          onChange={(event) => setDecision(event.target.value as OwnerDecision)}
          value={decision}
        >
          {OWNER_DECISIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        htmlFor={id.rent}
        hint="The owner-approved monthly rent to offer the tenant."
        label="Offered rent (monthly)"
        required
      >
        <input
          id={id.rent}
          inputMode="decimal"
          min="0"
          onChange={(event) => setOfferedRent(event.target.value)}
          type="number"
          value={offeredRent}
        />
      </Field>
      <div className="ui-row">
        <Field htmlFor={id.rbp} label="Resident benefit package (optional)">
          <input
            id={id.rbp}
            inputMode="decimal"
            min="0"
            onChange={(event) => setRbp(event.target.value)}
            type="number"
            value={rbp}
          />
        </Field>
        <Field htmlFor={id.insurance} label="Insurance (optional)">
          <input
            id={id.insurance}
            inputMode="decimal"
            min="0"
            onChange={(event) => setInsurance(event.target.value)}
            type="number"
            value={insurance}
          />
        </Field>
      </div>
      <Field htmlFor={id.form} label="Tenant info form URL (optional)">
        <input
          id={id.form}
          onChange={(event) => setInfoFormUrl(event.target.value)}
          type="url"
          value={infoFormUrl}
        />
      </Field>
      <p className="muted">
        Comp basis (optional). Your own numbers, shown source-tagged in the owner email. A
        separate comp-derived suggestion needs Admin approval before it enters a draft.
      </p>
      <div className="ui-row">
        <Field htmlFor={id.zillowLow} label="Zillow low (optional)">
          <input
            id={id.zillowLow}
            inputMode="decimal"
            min="0"
            onChange={(event) => setZillowLow(event.target.value)}
            type="number"
            value={zillowLow}
          />
        </Field>
        <Field htmlFor={id.zillowHigh} label="Zillow high (optional)">
          <input
            id={id.zillowHigh}
            inputMode="decimal"
            min="0"
            onChange={(event) => setZillowHigh(event.target.value)}
            type="number"
            value={zillowHigh}
          />
        </Field>
        <Field htmlFor={id.pmiNumber} label="PMI rental-analysis number (optional)">
          <input
            id={id.pmiNumber}
            inputMode="decimal"
            min="0"
            onChange={(event) => setPmiNumber(event.target.value)}
            type="number"
            value={pmiNumber}
          />
        </Field>
      </div>
      {compScreenshotExecutable &&
      !compScreenshotRef &&
      !rollbackRecoveryPending &&
      !rollbackPreview ? (
        <div className="ui-stack">
          <Field
            htmlFor={id.screenshot}
            hint="JPEG, PNG, WebP, or HEIC up to 5 MiB. Selection stays local until you review it."
            label="Comps screenshot (optional)"
          >
            <input
              accept="image/jpeg,image/png,image/webp,image/heic,.heic,.heif"
              disabled={screenshotPending}
              id={id.screenshot}
              onChange={(event) => selectScreenshot(event.target.files?.[0] ?? undefined)}
              type="file"
            />
          </Field>
          {selectedScreenshot && !screenshotPreview ? (
            <div className="ui-row">
              <Button
                disabled={screenshotPending}
                onClick={() => void prepareScreenshot()}
                type="button"
                variant="secondary"
              >
                {screenshotPending ? "Reviewing…" : "Review screenshot"}
              </Button>
            </div>
          ) : null}
          {screenshotPreview ? (
            <div className="ui-stack">
              <p className="muted">
                Confirm {screenshotPreview.filename} · {screenshotPreview.mimeType} ·{" "}
                {formatFileSize(screenshotPreview.sizeBytes)} · in-boundary Drive folder.
              </p>
              <div className="ui-row">
                <Button
                  disabled={screenshotPending}
                  onClick={() => void confirmScreenshot()}
                  type="button"
                >
                  {screenshotPending ? "Storing…" : "Confirm and store screenshot"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {compScreenshotRef ? (
        <p className="muted">Screenshot stored (ref {compScreenshotRef}).</p>
      ) : null}
      {screenshotExecutionId &&
      !compScreenshotRef &&
      !rollbackRecoveryPending &&
      !selectedScreenshot &&
      !screenshotPreview ? (
        <div className="ui-row">
          <Button
            disabled={screenshotPending}
            onClick={() => void reconcileScreenshot()}
            type="button"
            variant="secondary"
          >
            {screenshotPending ? "Checking…" : "Check exact screenshot attempt"}
          </Button>
        </div>
      ) : null}
      {(compScreenshotRef || rollbackRecoveryPending) &&
      screenshotExecutionId &&
      !rollbackPreview ? (
        <div className="ui-row">
          <Button
            disabled={screenshotPending}
            onClick={() => void prepareScreenshotRollback()}
            type="button"
            variant="secondary"
          >
            {screenshotPending
              ? "Reviewing…"
              : rollbackRecoveryPending
                ? "Recover screenshot removal"
                : "Review screenshot removal"}
          </Button>
        </div>
      ) : null}
      {rollbackPreview ? (
        <div className="ui-stack">
          <p className="muted">
            Confirm removal of {rollbackPreview.targetRef} from{" "}
            {rollbackPreview.targetLabel}. Only this exact receipted file will move to
            Drive trash.
          </p>
          {rollbackPreview.providerDriftedSinceReceipt ? (
            <p className="muted">
              Drive metadata changed after storage. This confirmation binds the current
              exact file version.
            </p>
          ) : null}
          <div className="ui-row">
            <Button
              disabled={screenshotPending}
              onClick={() => void confirmScreenshotRollback()}
              type="button"
              variant="secondary"
            >
              {screenshotPending ? "Moving to trash…" : "Confirm move to Drive trash"}
            </Button>
          </div>
        </div>
      ) : null}
      {screenshotStatus ? <p className="muted">{screenshotStatus}</p> : null}
      <div className="ui-row">
        <Button
          disabled={lookupPending}
          onClick={() => void lookupComps()}
          type="button"
          variant="secondary"
        >
          {lookupPending ? "Looking up…" : "Look up market comps (reference only)"}
        </Button>
      </div>
      {compLookup ? (
        <div className="ui-stack">
          <p className="muted">
            {compLookup.confidence === "Likely" &&
            (compLookup.rangeLow !== undefined || compLookup.pointEstimate !== undefined)
              ? `Comparable rents${
                  compLookup.rangeLow !== undefined && compLookup.rangeHigh !== undefined
                    ? ` ${formatMoney(compLookup.rangeLow)}–${formatMoney(compLookup.rangeHigh)}`
                    : ""
                }${
                  compLookup.pointEstimate !== undefined
                    ? ` (point estimate ${formatMoney(compLookup.pointEstimate)})`
                    : ""
                } · Source: ${compLookup.source}`
              : `No comparable range is available yet (${compLookup.source}). Needs verification.`}
          </p>
          <p className="muted">Reference only. Does not set the rent.</p>
        </div>
      ) : null}
      <div className="ui-row">
        <Button disabled={!ready || pending} onClick={() => void submit()} type="button">
          {pending
            ? "Saving…"
            : current
              ? "Update owner decision"
              : "Record owner decision"}
        </Button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
      {saved && !error ? (
        <p className="muted">Decision recorded. The tenant offer is ready below.</p>
      ) : null}
    </div>
  );
}

/**
 * Mark the renewal complete for a live lease (operator confirms the process is done). Once complete it
 * shows a done state; otherwise it offers the button. Complete is app-owned state only — it writes back
 * to no system of record.
 */
export function RenewalCompleteButton({
  leaseId,
  complete,
}: Readonly<{ leaseId: string; complete: boolean }>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/lease-renewal/renewal-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark_complete", leaseId }),
      });
      if (response.ok) {
        router.refresh();
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not mark the renewal complete.");
      }
    } catch {
      setError("Could not reach the renewal service.");
    } finally {
      setPending(false);
    }
  }

  if (complete) {
    return <p className="muted">✓ Renewal marked complete.</p>;
  }

  return (
    <div className="ui-stack">
      <div className="ui-row">
        <Button
          disabled={pending}
          onClick={() => void submit()}
          type="button"
          variant="secondary"
        >
          {pending ? "Saving…" : "Mark renewal complete"}
        </Button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
