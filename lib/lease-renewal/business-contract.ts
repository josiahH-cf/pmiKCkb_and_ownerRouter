// Bodyless, client-safe projection of the verified Lease Renewal operating contract.
// Sources: lease-renewal-discovery-reference.md §§1-3 and
// lease-renewal-connector-design.md §3.4. This module contains rules only, never customer values.

export const LEASE_CADENCE_CONTRACT = Object.freeze([
  {
    id: "candidate_window",
    requirement: "Create the candidate worklog about two months before lease end.",
    sourceOwner: "RentVine lease end date",
    currentSupport:
      "Documented rule; Live Review currently reads the full lease set and does not persist a per-candidate in/out/review disposition.",
    status: "absent" as const,
  },
  {
    id: "off_cycle",
    requirement:
      "Review off-cycle end dates and record why each atypical lease is included, excluded, or held for review.",
    sourceOwner: "RentVine plus human worklog decision",
    currentSupport:
      "The full-set read avoids silently prefiltering off-cycle leases, but the explicit disposition reason and reviewer worklog are not yet persisted.",
    status: "partial" as const,
  },
  {
    id: "owner_direction",
    requirement: "Obtain source-backed owner direction before tenant commitments.",
    sourceOwner: "Owner communication of record",
    currentSupport:
      "Governed communication linking exists; a durable per-lease owner-decision checkpoint is not yet bound to Live Review.",
    status: "absent" as const,
  },
  {
    id: "tenant_offer",
    requirement: "Send the reviewed tenant offer by the fifteenth.",
    sourceOwner: "Owning renewal record plus exact channel receipts",
    currentSupport:
      "The timing rule is documented; Live eligibility and a per-lease due-date checkpoint are not yet projected here.",
    status: "absent" as const,
  },
  {
    id: "signature_window",
    requirement: "Preserve at least thirty days for tenant signature.",
    sourceOwner: "Lease timing record and Dotloop signature state",
    currentSupport:
      "The rule is documented; the Live Review does not currently reconcile signature-window or signer status.",
    status: "absent" as const,
  },
  {
    id: "multichannel",
    requirement: "Track Gmail, RentVine Portal Chat, and SMS separately.",
    sourceOwner: "Each channel provider",
    currentSupport:
      "Separate governed action contracts exist; one channel receipt never proves another and provider activation remains per action.",
    status: "supported" as const,
  },
] as const);

export const LEASE_FIELD_AUTHORITY_CONTRACT = Object.freeze([
  {
    field: "Lease dates and renewal timing",
    precedence: "RentVine lease record → Renewal Sheet renewal date",
    fallback: "No automatic fallback",
    disposition: "High-risk human review; never auto-apply",
  },
  {
    field: "Current rent",
    precedence: "RentVine → Renewal Sheet current rent",
    fallback: "No automatic fallback",
    disposition: "Financial human review; never auto-apply",
  },
  {
    field: "Market value",
    precedence: "PMI Free Rental Analysis number → Zillow supporting range",
    fallback: "Zillow plus manual verification and approval when the PMI tool is down",
    disposition: "Pricing approval required; never auto-accept",
  },
  {
    field: "Operational property attributes",
    precedence: "RentVine building level → Inspection Tracker → Property Attributes",
    fallback: "Conflict stays Needs Review",
    disposition: "Medium human review; no silent correction",
  },
  {
    field: "Lease-contract terms",
    precedence: "Active lease or RentVine building level → Renewal Sheet",
    fallback: "Unlisted or conflicting authority stays Blocked",
    disposition: "Legal/high-risk human review; never auto-apply",
  },
  {
    field: "Owner renewal decision",
    precedence: "Owner communication of record → Renewal Sheet",
    fallback: "Missing direction stays Blocked",
    disposition: "Owner-facing human confirmation required",
  },
  {
    field: "Tenant intake",
    precedence: "Latest authorized Google Form → Renewal Sheet",
    fallback: "Missing or conflicting facts stay Needs Review",
    disposition: "Medium human review",
  },
  {
    field: "Canonical address",
    precedence: "RentVine canonical address → Renewal Sheet strings",
    fallback: "Ambiguous joins stay Blocked",
    disposition: "Join-critical human review; never guess",
  },
  {
    field: "Workflow status flags",
    precedence: "Renewal Sheet status → deterministic inference",
    fallback: "Unknown tokens stay Needs Review",
    disposition: "Low-risk normalization only after review",
  },
] as const);

export const LEASE_SYSTEM_OWNERSHIP_CONTRACT = Object.freeze([
  {
    system: "PMI KC Live Renewal Review",
    ownership:
      "Read-only coordination, source conflict review, app decisions, and approval projection",
    liveWrite: "No system-of-record write from the review itself",
  },
  {
    system: "RentVine",
    ownership: "Lease dates, current rent, party/property context, and renewal timing",
    liveWrite: "Per-action contract and exact provider confirmation required",
  },
  {
    system: "Renewal Sheet",
    ownership: "Operational worklog and cross-team status surface",
    liveWrite:
      "Stable row/column mapping, exact preview, approval, and readback required",
  },
  {
    system: "PMI Free Rental Analysis",
    ownership: "Authoritative market-value number used on the worklog",
    liveWrite: "Read/manual input only; no automated acceptance",
  },
  {
    system: "Zillow",
    ownership: "Supporting comp range and approved fallback context",
    liveWrite: "Public context only; manual verification and approval required",
  },
  {
    system: "Dotloop",
    ownership: "Document package, signature state, and executed signed lease",
    liveWrite: "Each create/upload/signature action activates independently",
  },
  {
    system: "Gmail, Portal Chat, and SMS",
    ownership: "Separate communication delivery and response evidence",
    liveWrite: "Exact human confirmation and one receipt per channel",
  },
] as const);

export const LEASE_LIVE_LIFECYCLE_OWNERSHIP = Object.freeze({
  currentCoordinationSurface: "/lease-renewal/live",
  currentCoordinationScope:
    "Full-set source reconciliation under the shared live-review read, plus app-owned resolution and writeback-approval records.",
  durablePerLeaseLifecycle: "absent" as const,
  exactNextAction:
    "Keep external actions blocked until one durable per-lease Live renewal instance owns the candidate disposition, owner, due date, blocker, next action, approvals, communication receipts, provider receipts, and business closeout gates.",
});
