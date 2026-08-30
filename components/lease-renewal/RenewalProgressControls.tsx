"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field } from "@/components/ui";
import { parseCurrencyInput, parseOptionalCurrencyInput } from "@/lib/currency-input";
import type { MarketCompQueryBasis } from "@/lib/lease-renewal/market-comp-query-basis";
import { computeUnderMarketSignal } from "@/lib/lease-renewal/under-market";

// LIVE workspace controls persist app-owned inputs through the versioned renewal-progress boundary
// and refresh the server-rendered evidence projection.
// They change NO system of record: RentVine and the Sheet stay read-only; recording a decision here does
// not compose or send anything. The tenant offer is drafted only through the gated Gmail composer.

type OwnerDecision = "keep_same" | "increase" | "custom";

interface RecordedDecision {
  decision: OwnerDecision;
  offeredRent: number;
  charges?: { rbp?: number; insurance?: number };
  infoFormUrl?: string;
  market?: {
    rangeLow?: number;
    rangeHigh?: number;
    pmiNumber?: number;
    compScreenshotRef?: string;
    compSource?: string;
    compRetrievedAt?: string;
    /** S60: the persisted provider basis (only the fields this surface reads). */
    provider?: { source: string; pointEstimate: number; retrievedAt: string };
  };
}

/** A DISPLAY-only comp lookup result (mirrors the server MarketCompResult). Never bound to offeredRent. */
interface CompLookup {
  rangeLow?: number;
  rangeHigh?: number;
  pointEstimate?: number;
  compCount?: number;
  /** S60: provider comparables, kept in provider order with correlation intact. */
  comparables?: {
    rent: number;
    correlation?: number;
    distanceMiles?: number;
    propertyType?: string;
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
    listedDate?: string;
    lastSeenDate?: string;
    daysOld?: number;
    daysOnMarket?: number;
  }[];
  subjectProperty?: {
    propertyType?: string;
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
  };
  source: string;
  sourceUrl?: string;
  retrievedAt?: string;
  confidence: "Likely" | "Needs Verification";
  /** S59: the legible refusal cause; each renders as a distinct message (AC-S59-8). */
  reason?: string;
  /** S59: the operator-visible remaining-calls figure on the RentCast path. */
  quota?: { used: number; allowance: number; remaining: number; warn: boolean };
  cached?: boolean;
  queryBasis?: MarketCompQueryBasis;
}

/** S60: the /markets trend lookup result the composer persists with the provider basis. */
interface TrendLookup {
  zipCode?: string;
  retrievedAt?: string;
  history?: Record<string, { averageRent?: unknown; medianRent?: unknown }>;
  confidence?: string;
}

// S59 / AC-S59-8: each refusal cause renders as its own plain sentence, never one generic message
// and never a number. Hand entry stays available on every one of them.
const COMP_REFUSAL_COPY: Record<string, string> = {
  missing_key:
    "The comp service key is not set up on this environment. Enter your own comp numbers.",
  missing_address:
    "This lease has no address on file, so there is nothing to search. Enter your own comp numbers.",
  timeout: "The comp lookup timed out. Try again, or enter your own comp numbers.",
  network_error:
    "The comp service could not be reached. Try again, or enter your own comp numbers.",
  http_error:
    "The comp service answered with an error. Try again, or enter your own comp numbers.",
  parse_error:
    "The comp service sent a response the app could not read. Enter your own comp numbers.",
  too_few_comps:
    "Fewer than three comparable listings came back, which is too thin to stand on. Enter your own comp numbers.",
  out_of_allowance:
    "The monthly comp-lookup allowance is used up, so no live lookup ran. Enter your own comp numbers.",
  provider_not_live:
    "Live comp lookups are not turned on for this environment. Enter your own comp numbers.",
  invalid_currency_format:
    "One of the typed comp values is not valid money. Correct it before looking up comps.",
  rentvine_not_configured:
    "RentVine is not connected, so the app cannot verify this lease before looking up comps.",
  rentvine_account_mismatch:
    "The configured RentVine account does not match the approved production account, so no lookup ran.",
  rentvine_read_failed:
    "The current RentVine lease read failed, so no live comp lookup ran. Try again after the connection recovers.",
  lease_data_expired:
    "The lease data is stale. Refresh the Renewals desk before looking up comps.",
  lease_read_incomplete:
    "The current RentVine read is incomplete, so this lease cannot be verified for a comp lookup.",
  lease_not_found:
    "This lease is not present in the current complete RentVine read, so no lookup ran.",
  lease_ambiguous:
    "More than one current RentVine row matched this lease, so no lookup ran.",
  action_not_production_allowed:
    "The RentCast read action is closed, so no live comp lookup ran.",
  action_runtime_suspended:
    "Live RentCast reads are temporarily suspended, so no comp lookup ran.",
};

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
  currentRent,
  compScreenshotExecutable = false,
}: Readonly<{
  leaseId: string;
  current: RecordedDecision | null;
  /** Server-rendered address used only to suppress an obviously empty lookup; it is never submitted. */
  address?: string;
  /** S60: the authoritative current rent (RentVine), for the INTERNAL under-market signal only. */
  currentRent?: number;
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
  const [rangeLow, setRangeLow] = useState(
    current?.market?.rangeLow !== undefined ? String(current.market.rangeLow) : "",
  );
  const [rangeHigh, setRangeHigh] = useState(
    current?.market?.rangeHigh !== undefined ? String(current.market.rangeHigh) : "",
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
  const [trendLookup, setTrendLookup] = useState<TrendLookup | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  // S60: the INTERNAL under-market signal. Computed only from a PROVIDER basis (a fresh live
  // lookup, else the persisted provider block) against the authoritative current rent — never from
  // the operator's own typed numbers, and never rendered into any client draft.
  const providerPointEstimate =
    compLookup?.confidence === "Likely" && compLookup.source === "RentCast"
      ? compLookup.pointEstimate
      : current?.market?.provider?.pointEstimate;
  const underMarketSignal =
    currentRent !== undefined
      ? computeUnderMarketSignal({ currentRent, providerPointEstimate })
      : null;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const id = {
    decision: useId(),
    rent: useId(),
    form: useId(),
    rbp: useId(),
    insurance: useId(),
    rangeLow: useId(),
    rangeHigh: useId(),
    pmiNumber: useId(),
    screenshot: useId(),
  };

  // Reference-only market-comp lookup: runs the configured provider (the manual adapter echoes the
  // operator's own numbers; the RentCast path is separately gate-controlled) and DISPLAYS the range. It never
  // sets the offered rent — the comp-derived SUGGESTED number is the separate Admin-gated S29.
  // S59: a lease with no address refuses LOCALLY and makes no request at all — the literal string
  // "Unknown" is never sent. Otherwise the browser nominates only the lease identity; the server
  // re-resolves every address/unit fact and decides whether a trend read has a usable postal code.
  async function lookupComps() {
    const trimmedAddress = (address ?? "").trim();
    if (trimmedAddress === "") {
      setCompLookup({
        source: "RentCast",
        confidence: "Needs Verification",
        reason: "missing_address",
      });
      return;
    }
    setLookupPending(true);
    setTrendLookup(null);
    try {
      const manualBasis: Record<string, number> = {};
      const low = parseOptionalCurrencyInput(rangeLow);
      const high = parseOptionalCurrencyInput(rangeHigh);
      const pmi = parseOptionalCurrencyInput(pmiNumber);
      if (!low.ok || !high.ok || !pmi.ok) {
        setCompLookup({
          source: "Manual entry",
          confidence: "Needs Verification",
          reason: "invalid_currency_format",
        });
        return;
      }
      if (low.value !== undefined) manualBasis.rangeLow = low.value;
      if (high.value !== undefined) manualBasis.rangeHigh = high.value;
      if (pmi.value !== undefined) manualBasis.pmiNumber = pmi.value;
      const response = await fetch("/api/lease-renewal/market-comps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leaseId,
          ...(Object.keys(manualBasis).length > 0 ? { manualBasis } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as CompLookup & {
        error?: string;
        error_type?: string;
      };
      setCompLookup(
        response.ok
          ? payload
          : {
              source: "Market comp service",
              confidence: "Needs Verification",
              reason: payload.error_type ?? "http_error",
            },
      );
      // S60: one deliberate follow-on trend call (separately billed and metered) when the lease's
      // zip is known and the comps lookup itself came back live. The decided presentation renders
      // it inline in the owner draft with a source link.
      if (
        response.ok &&
        payload.confidence === "Likely" &&
        payload.source === "RentCast"
      ) {
        try {
          const trendResponse = await fetch("/api/lease-renewal/market-comps", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operation: "trend",
              leaseId,
            }),
          });
          const trendPayload = (await trendResponse
            .json()
            .catch(() => ({}))) as TrendLookup;
          setTrendLookup(trendResponse.ok ? trendPayload : null);
        } catch {
          setTrendLookup(null);
        }
      }
    } catch {
      setCompLookup({
        source: "Market comp service",
        confidence: "Needs Verification",
        reason: "network_error",
      });
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

  const offeredRentParsed = parseCurrencyInput(offeredRent);
  const rbpParsed = parseOptionalCurrencyInput(rbp);
  const insuranceParsed = parseOptionalCurrencyInput(insurance);
  const rangeLowParsed = parseOptionalCurrencyInput(rangeLow);
  const rangeHighParsed = parseOptionalCurrencyInput(rangeHigh);
  const pmiNumberParsed = parseOptionalCurrencyInput(pmiNumber);
  const ready =
    offeredRentParsed.ok &&
    offeredRentParsed.value > 0 &&
    rbpParsed.ok &&
    insuranceParsed.ok &&
    rangeLowParsed.ok &&
    rangeHighParsed.ok &&
    pmiNumberParsed.ok;

  async function submit() {
    if (!ready || !offeredRentParsed.ok) {
      setError(
        "Enter money as 1500 or $1,500.00; negative or partial values are not accepted.",
      );
      return;
    }
    setPending(true);
    setError("");
    setSaved(false);
    const charges: { rbp?: number; insurance?: number } = {};
    if (rbpParsed.ok && rbpParsed.value !== undefined) charges.rbp = rbpParsed.value;
    if (insuranceParsed.ok && insuranceParsed.value !== undefined) {
      charges.insurance = insuranceParsed.value;
    }
    const body: Record<string, unknown> = {
      action: "owner_decision",
      leaseId,
      decision,
      offeredRent: offeredRentParsed.value,
    };
    if (charges.rbp !== undefined || charges.insurance !== undefined) {
      body.charges = charges;
    }
    if (infoFormUrl.trim() !== "") body.infoFormUrl = infoFormUrl.trim();
    const market: Record<string, unknown> = {};
    if (rangeLowParsed.ok && rangeLowParsed.value !== undefined) {
      market.rangeLow = rangeLowParsed.value;
    }
    if (rangeHighParsed.ok && rangeHighParsed.value !== undefined) {
      market.rangeHigh = rangeHighParsed.value;
    }
    if (pmiNumberParsed.ok && pmiNumberParsed.value !== undefined) {
      market.pmiNumber = pmiNumberParsed.value;
    }
    // The server attaches a screenshot only from its durable successful receipt. Never trust or send
    // a client-supplied Drive reference as renewal progress.
    if (compLookup?.source) market.compSource = compLookup.source;
    if (compLookup?.retrievedAt) market.compRetrievedAt = compLookup.retrievedAt;
    // S60: persist the PROVIDER-RETRIEVED basis verbatim, beside (never over) the typed fields, so
    // the owner draft prints the number it actually retrieved under the source it came from.
    if (
      compLookup &&
      compLookup.confidence === "Likely" &&
      compLookup.source === "RentCast" &&
      compLookup.rangeLow !== undefined &&
      compLookup.rangeHigh !== undefined &&
      compLookup.pointEstimate !== undefined &&
      compLookup.compCount !== undefined &&
      compLookup.retrievedAt
    ) {
      const trendMonths: Record<string, { averageRent?: number; medianRent?: number }> =
        {};
      for (const [month, values] of Object.entries(trendLookup?.history ?? {})) {
        if (!/^\d{4}-\d{2}$/.test(month)) continue;
        const entry: { averageRent?: number; medianRent?: number } = {};
        if (
          typeof values?.averageRent === "number" &&
          Number.isFinite(values.averageRent)
        ) {
          entry.averageRent = values.averageRent;
        }
        if (
          typeof values?.medianRent === "number" &&
          Number.isFinite(values.medianRent)
        ) {
          entry.medianRent = values.medianRent;
        }
        if (Object.keys(entry).length > 0) trendMonths[month] = entry;
      }
      market.provider = {
        source: compLookup.source,
        rangeLow: compLookup.rangeLow,
        rangeHigh: compLookup.rangeHigh,
        pointEstimate: compLookup.pointEstimate,
        compCount: compLookup.compCount,
        retrievedAt: compLookup.retrievedAt,
        ...(compLookup.queryBasis
          ? {
              radiusMiles: compLookup.queryBasis.policy.maxRadiusMiles,
              requestedCompCount: compLookup.queryBasis.policy.requestedCompCount,
              lookupSubjectAttributes:
                compLookup.queryBasis.policy.lookupSubjectAttributes,
              providerVersion: compLookup.queryBasis.policy.providerVersion,
              cacheState: compLookup.cached ? "cache" : "live",
              omittedAttributes: compLookup.queryBasis.attributes
                .filter((attribute) => attribute.status === "omitted")
                .map((attribute) => ({
                  field: attribute.field,
                  reason: attribute.reason,
                })),
            }
          : {}),
        ...(compLookup.queryBasis && Object.keys(compLookup.queryBasis.query).length > 0
          ? {
              unitFilters: {
                ...compLookup.queryBasis.query,
              },
            }
          : {}),
        ...(compLookup.subjectProperty
          ? { subjectProperty: compLookup.subjectProperty }
          : {}),
        ...(compLookup.comparables && compLookup.comparables.length > 0
          ? { comps: compLookup.comparables.slice(0, 50) }
          : {}),
        ...(trendLookup?.zipCode &&
        trendLookup.retrievedAt &&
        Object.keys(trendMonths).length > 0
          ? {
              trend: {
                zipCode: trendLookup.zipCode,
                retrievedAt: trendLookup.retrievedAt,
                months: trendMonths,
              },
            }
          : {}),
      };
    }
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
          onChange={(event) => setOfferedRent(event.target.value)}
          placeholder="$1,500"
          type="text"
          value={offeredRent}
        />
      </Field>
      <div className="ui-row">
        <Field htmlFor={id.rbp} label="Resident benefit package (optional)">
          <input
            id={id.rbp}
            inputMode="decimal"
            onChange={(event) => setRbp(event.target.value)}
            placeholder="$25"
            type="text"
            value={rbp}
          />
        </Field>
        <Field htmlFor={id.insurance} label="Insurance (optional)">
          <input
            id={id.insurance}
            inputMode="decimal"
            onChange={(event) => setInsurance(event.target.value)}
            placeholder="$15"
            type="text"
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
        <Field htmlFor={id.rangeLow} label="Comp low (typed, optional)">
          <input
            id={id.rangeLow}
            inputMode="decimal"
            onChange={(event) => setRangeLow(event.target.value)}
            placeholder="$1,400"
            type="text"
            value={rangeLow}
          />
        </Field>
        <Field htmlFor={id.rangeHigh} label="Comp high (typed, optional)">
          <input
            id={id.rangeHigh}
            inputMode="decimal"
            onChange={(event) => setRangeHigh(event.target.value)}
            placeholder="$1,600"
            type="text"
            value={rangeHigh}
          />
        </Field>
        <Field htmlFor={id.pmiNumber} label="PMI rental-analysis number (optional)">
          <input
            id={id.pmiNumber}
            inputMode="decimal"
            onChange={(event) => setPmiNumber(event.target.value)}
            placeholder="$1,525"
            type="text"
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
                }${
                  compLookup.compCount !== undefined
                    ? ` from ${compLookup.compCount} comps`
                    : ""
                } · Source: ${compLookup.source}`
              : (COMP_REFUSAL_COPY[compLookup.reason ?? ""] ??
                `No comparable range is available yet (${compLookup.source}). Needs verification.`)}
          </p>
          {compLookup.quota ? (
            <p className="muted">
              {compLookup.quota.remaining} of {compLookup.quota.allowance} comp lookups
              left this month.
              {compLookup.quota.warn ? " Running low; use them deliberately." : ""}
            </p>
          ) : null}
          {compLookup.source === "RentCast" && compLookup.queryBasis ? (
            <div className="ui-stack-tight">
              <p className="muted">
                Query basis: {compLookup.queryBasis.policy.maxRadiusMiles}-mile maximum
                radius · {compLookup.queryBasis.policy.requestedCompCount} requested comps
                · RentCast subject-attribute lookup{" "}
                {compLookup.queryBasis.policy.lookupSubjectAttributes ? "on" : "off"}.
              </p>
              <p className="muted">Address sent: {compLookup.queryBasis.addressLabel}</p>
              <ul className="ui-rows">
                <li>
                  Contractual base rent:{" "}
                  {compLookup.queryBasis.baseRent.status === "verified" ? (
                    <>
                      {formatMoney(compLookup.queryBasis.baseRent.value)} (
                      {compLookup.queryBasis.baseRent.sourcePath})
                    </>
                  ) : (
                    <>omitted: {compLookup.queryBasis.baseRent.reason}</>
                  )}
                  . Recurring charges are separate.
                </li>
                {compLookup.queryBasis.attributes.map((attribute) => (
                  <li key={attribute.field}>
                    {attribute.label}:{" "}
                    {attribute.status === "sent" ? (
                      <>
                        {attribute.value} sent from {attribute.sourcePath}
                      </>
                    ) : (
                      <>omitted: {attribute.reason}</>
                    )}
                  </li>
                ))}
              </ul>
              <p className="muted">
                {compLookup.cached ? "Cache hit" : "Fresh provider lookup"}
                {compLookup.retrievedAt ? (
                  <> · retrieved {compLookup.retrievedAt}</>
                ) : null}
                .
              </p>
              {compLookup.sourceUrl ? (
                <p className="muted">
                  <a href={compLookup.sourceUrl} rel="noreferrer" target="_blank">
                    RentCast source
                  </a>
                </p>
              ) : null}
              {compLookup.subjectProperty ? (
                <p className="muted">
                  RentCast-returned subject attributes:
                  {compLookup.subjectProperty.propertyType ? (
                    <> {compLookup.subjectProperty.propertyType}</>
                  ) : null}
                  {compLookup.subjectProperty.bedrooms !== undefined ? (
                    <> · {compLookup.subjectProperty.bedrooms} bed</>
                  ) : null}
                  {compLookup.subjectProperty.bathrooms !== undefined ? (
                    <> · {compLookup.subjectProperty.bathrooms} bath</>
                  ) : null}
                  {compLookup.subjectProperty.squareFootage !== undefined ? (
                    <> · {compLookup.subjectProperty.squareFootage} sq ft</>
                  ) : null}
                  . These are provider-returned, not relabeled RentVine facts.
                </p>
              ) : null}
              {compLookup.comparables && compLookup.comparables.length > 0 ? (
                <ol className="ui-rows">
                  {compLookup.comparables.map((comp, index) => (
                    <li key={[index, comp.rent, comp.correlation ?? "none"].join("-")}>
                      Comp {index + 1}: {formatMoney(comp.rent)}
                      {comp.correlation !== undefined ? (
                        <> · {Math.round(comp.correlation * 100)}% correlation</>
                      ) : null}
                      {comp.distanceMiles !== undefined ? (
                        <> · {comp.distanceMiles} mi</>
                      ) : null}
                      {comp.propertyType ? <> · {comp.propertyType}</> : null}
                      {comp.bedrooms !== undefined ? <> · {comp.bedrooms} bed</> : null}
                      {comp.bathrooms !== undefined ? (
                        <> · {comp.bathrooms} bath</>
                      ) : null}
                      {comp.squareFootage !== undefined ? (
                        <> · {comp.squareFootage} sq ft</>
                      ) : null}
                      {comp.daysOld !== undefined ? (
                        <> · {comp.daysOld} days old</>
                      ) : null}
                      {comp.daysOnMarket !== undefined ? (
                        <> · {comp.daysOnMarket} days on market</>
                      ) : null}
                      {comp.listedDate ? <> · listed {comp.listedDate}</> : null}
                      {comp.lastSeenDate ? <> · last seen {comp.lastSeenDate}</> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
              <p className="muted">
                Provider order shown. The app applies no hidden freshness or selection
                filter.
              </p>
            </div>
          ) : null}
          <p className="muted">Reference only. Does not set the rent.</p>
        </div>
      ) : null}
      {underMarketSignal ? (
        <p className="muted" role="note">
          {underMarketSignal.message}
        </p>
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
 * Request app completion for a live lease. The server refuses until every accepted-path evidence
 * predicate is satisfied. App completion is still separate from every system-of-record write.
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
