import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RUNTIME_ROOTS = ["app", "lib", "scripts"];
const REVIEWED_PROVIDER_MODULE_SUFFIXES = [
  "/lib/gmail-runtime/client",
  "/lib/google-drive/renewal-comp-screenshot",
  "/lib/google-sheets/read-client",
  "/lib/google-sheets/write-client",
  "/lib/integrations/rentvine/client",
  "/lib/lease-renewal/market-comp-provider",
  "/lib/maintenance/image-store",
  "/lib/vendor/live-lifecycle-provider",
];
const PROVIDER_TYPE_PATTERN = /(?:Client|Provider|Reader|Store|Writer)$/;
const PROVIDER_FACTORY_NAME_PATTERN =
  /^create(?:[A-Z][A-Za-z0-9]*)?(?:Client|Provider|Reader|Store|Writer)$/;
const LIVE_CONFIG_MODULE_SUFFIX = "/lib/lease-renewal/live-config";
const LIVE_CONFIG_FACTORY_NAMES = new Set([
  "buildLiveRenewalConfig",
  "buildLiveRentVineConfig",
]);
// These are orchestration wrappers around an inventoried leaf factory. Counting both their
// call sites and their leaf factory would add noise without finding another provider construction.
const ORCHESTRATION_FACTORY_WRAPPERS = new Set([
  "createReadOnlyReconciliationClient",
  "createRuntimeClient",
]);

// Reviewed inventory. A new provider construction/factory invocation must be deliberately classified
// instead of silently becoming an unwired runtime-suspension call site.
const EXPECTED_BOUNDARIES = [
  "app/api/gmail-hub/pubsub/route.ts:POST:dependencies.createClient",
  "app/api/lease-renewal/market-comps/route.ts:POST:createMarketCompProvider",
  "app/api/maintenance/photo/route.ts:POST:createMaintenanceImageStore",
  "lib/admin/space-provisioning-provider.ts:provisionDataStoreAndImportSource:this.dataStores.createDataStore",
  "lib/external-execution/governed-draft-execution.ts:executeGovernedDraft:request.createClient",
  "lib/external-execution/governed-draft-execution.ts:reconcileGovernedDraft:request.createClient",
  "lib/gmail-hub/dependencies.ts:createDescriptorBoundGmailRuntimeClient:construct",
  "lib/gmail-hub/dependencies.ts:createDescriptorBoundGmailRuntimeClient:new GmailRuntimeClient",
  "lib/gmail-hub/dependencies.ts:createGmailHubRuntimeDependencies:factories.createStore",
  "lib/gmail-hub/service.ts:connection:this.createClient",
  "lib/gmail-hub/service.ts:createClient:this.dependencies.createClient",
  "lib/gmail-hub/service.ts:createReadOnlyReconciliationClient:this.createClient",
  "lib/gmail-hub/service.ts:createRuntimeClient:this.createClient",
  "lib/gmail-hub/service.ts:runClaimedLabelMutation:this.createClient",
  "lib/gmail-hub/service.ts:runGovernedLabelEffect:this.createClient",
  "lib/gmail-hub/service.ts:sendConfirmed:this.createClient",
  "lib/gmail-hub/service.ts:watchMailbox:this.createClient",
  "lib/lease-renewal/comp-screenshot-runtime.ts:createProvider:new GoogleDriveRenewalCompScreenshotProvider",
  "lib/lease-renewal/comp-screenshot-service.ts:commitCompScreenshotRollback:deps.createProvider",
  "lib/lease-renewal/comp-screenshot-service.ts:getProvider:deps.createProvider",
  "lib/lease-renewal/comp-screenshot-service.ts:previewCompScreenshotRollback:deps.createProvider",
  "lib/lease-renewal/comp-screenshot-service.ts:reconcileCompScreenshot:deps.createProvider",
  "lib/lease-renewal/execution/renewal-draft-request.ts:executeRenewalNoticeDraft:createClient",
  "lib/lease-renewal/execution/renewal-notice-draft-service.ts:createClient:deps.createGmailClient",
  "lib/lease-renewal/live-config.ts:buildLiveRenewalConfig:new GoogleSheetsApiReader",
  "lib/lease-renewal/live-config.ts:buildLiveRenewalConfig:new RentVineClient",
  "lib/lease-renewal/live-config.ts:buildLiveRentVineConfig:new RentVineClient",
  "lib/lease-renewal/sheet-writeback-service.ts:commitCorrection:deps.createWriter",
  "lib/lease-renewal/sheet-writeback-service.ts:commitWriteback:deps.createWriter",
  "lib/lease-renewal/sheet-writeback-service.ts:createWriter:new GoogleSheetsApiWriter",
  "lib/lease-renewal/sheet-writeback-service.ts:previewCorrection:deps.createWriter",
  "lib/lease-renewal/sheet-writeback-service.ts:previewWriteback:deps.createWriter",
  "lib/lease-renewal/sheet-writeback-service.ts:reconcileWriteback:deps.createWriter",
  "lib/maintenance/execution/owner-notice-draft-request.ts:executeMaintenanceOwnerNoticeDraft:createClient",
  "lib/maintenance/execution/owner-notice-draft-service.ts:createClient:deps.createGmailClient",
  "lib/notifications/internal-transactional-sender.ts:constructor:new GmailRuntimeClient",
  "lib/notifications/internal-transactional-sender.ts:send:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:constructor:new GmailRuntimeClient",
  "lib/vendor/live-lifecycle-adapters.ts:disableUser:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:ensureVendorPrincipal:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:findInviteByRfcMessageId:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:readDisableState:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:revokeRefreshTokens:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:sendInvite:this.createClient",
  "lib/vendor/live-lifecycle-runtime.ts:createLiveVendorLifecycleProvider:new LiveVendorLifecycleProvider",
  "lib/vendor/live-lifecycle-runtime.ts:execute:this.createProvider",
  "lib/vendor/live-lifecycle-runtime.ts:reconcile:this.createProvider",
  "scripts/capture-golden-data.ts:main:new GoogleSheetsApiReader",
  "scripts/capture-golden-data.ts:main:new RentVineClient",
  "scripts/capture-test-set-baseline.ts:main:new GoogleSheetsApiReader",
  "scripts/capture-test-set-baseline.ts:main:new RentVineClient",
  "scripts/discover-rentvine-fields.ts:main:new RentVineClient",
  "scripts/ensure-maintenance-drive-folder.ts:main:new GoogleDriveClient",
  "scripts/import-agent-search-documents.mjs:ensureDataStore:dataStoreClient.createDataStore",
  "scripts/prove-rehearsal-sheet-write.ts:main:new GoogleSheetsApiWriter",
  "scripts/smoke-gmail-draft-live.ts:createGmailClient:new GmailRuntimeClient",
  "scripts/smoke-gmail-draft-live.ts:runGmailDraftSmoke:dependencies.createGmailClient",
  "scripts/smoke-renewal-draft-live.ts:createDiagnosticProvider:new LiveRenewalGmailDraftProvider",
  "scripts/smoke-renewal-draft-live.ts:createGmailClient:new GmailRuntimeClient",
  "scripts/smoke-renewal-draft-live.ts:createRentVineClient:new RentVineClient",
  "scripts/smoke-renewal-draft-live.ts:executeDiagnosticRenewalDraft:dependencies.createDiagnosticGmailClient",
  "scripts/smoke-renewal-draft-live.ts:executeDiagnosticRenewalDraft:dependencies.createDiagnosticProvider",
  "scripts/smoke-renewal-draft-live.ts:runLive:dependencies.createGmailClient",
  "scripts/smoke-renewal-draft-live.ts:runLive:dependencies.createRentVineClient",
  "scripts/smoke-renewal-review.ts:main:new GoogleSheetsApiReader",
  "scripts/smoke-renewal-review.ts:main:new RentVineClient",
  // S59: the controlled RentCast smoke — an operator-run read-only diagnostic (AC-S59-1).
  "scripts/smoke-rentcast-comp.ts:main:new RentCastMarketCompProvider",
  "scripts/smoke-rentvine-read.ts:main:new RentVineClient",
  "scripts/smoke-sheet-read.ts:main:new GoogleSheetsApiReader",
  "scripts/smoke-sheet-write.ts:createWriter:new GoogleSheetsApiWriter",
  "scripts/smoke-sheet-write.ts:runSheetWriteSmoke:dependencies.createWriter",
].sort();

// The RentVine/renewal-Sheet builders are constructor wrappers shared by Product read-only surfaces
// and the Connection Center's explicit operator diagnostics. Inventory every wrapper invocation so
// classifying the leaf constructors cannot hide a new reachable, ungated caller.
const EXPECTED_LIVE_CONFIG_CALLS = [
  "app/api/ask/live-target/route.ts:POST:buildLiveRentVineConfig",
  // S58: the demand-driven refresh route (read-only; forces/revalidates the shared lease read).
  "app/api/lease-renewal/refresh/route.ts:POST:buildLiveRentVineConfig",
  "app/api/lease-renewal/renewal-notice-draft/route.ts:POST:buildLiveRentVineConfig",
  // S73: owner draft verification performs the canonical RentVine-versus-Sheet read.
  "app/api/lease-renewal/renewal-notice-draft/route.ts:loadOwnerCurrentRentDecision:buildLiveRenewalConfig",
  // S58: the currency assertion before recording progress (read-only; refuses expired data).
  "app/api/lease-renewal/renewal-progress/route.ts:defaultAssertLeaseDataCurrent:buildLiveRentVineConfig",
  // S62: the Admin rule surface verifies a portfolio id against the live read (read-only).
  "app/api/admin/owner-policy-rules/route.ts:portfolioIdResolvesLive:buildLiveRentVineConfig",
  // S60/S62: the clamp's authoritative-rent + portfolio-id read for the suggestion recompute.
  "app/api/lease-renewal/rent-suggestion/route.ts:resolveLeaseLiveFacts:buildLiveRentVineConfig",
  "app/api/maintenance/owner-notice-draft/route.ts:POST:buildLiveRentVineConfig",
  "app/lease-renewal/live/desk/lease/[leaseId]/page.tsx:LiveRenewalLeaseWorkspacePage:buildLiveRenewalConfig",
  "lib/connections/verification.ts:buildTransport:buildLiveRenewalConfig",
  "lib/connections/verification.ts:buildTransport:buildLiveRentVineConfig",
  "lib/console/rentvine-live-provider.ts:configuredClient:buildLiveRentVineConfig",
  "lib/lease-renewal/live-desk.ts:loadLiveRenewalDesk:buildLiveRenewalConfig",
  "lib/lease-renewal/live-desk.ts:loadLiveRenewalLeaseWorkspace:buildLiveRenewalConfig",
  "lib/lease-renewal/live-notices.ts:loadLiveRenewalNotices:buildLiveRentVineConfig",
  "lib/lease-renewal/live-review.ts:runLiveReview:buildLiveRenewalConfig",
  "lib/lease-renewal/sheet-writeback-service.ts:buildLiveWritebackDeps:buildLiveRenewalConfig",
  "lib/maintenance/live-unit-source.ts:loadLiveUnitCandidates:buildLiveRentVineConfig",
  // S68: source verification reads the cached complete lease portfolio and creates no effect.
  "lib/work-accountability/source-resolver.ts:readLiveRenewalLeaseVersion:buildLiveRentVineConfig",
  // 2026-08-26: bodyless, read-only operator discrepancy diagnostic.
  "scripts/diagnose-current-rent-truth.ts:diagnoseCurrentRentTruth:buildLiveRenewalConfig",
].sort();

const OPERATOR_DIAGNOSTIC_LIVE_CONFIG_CALLS = new Set([
  "lib/connections/verification.ts:buildTransport:buildLiveRenewalConfig",
  "lib/connections/verification.ts:buildTransport:buildLiveRentVineConfig",
  "scripts/diagnose-current-rent-truth.ts:diagnoseCurrentRentTruth:buildLiveRenewalConfig",
]);

const PRODUCT_READ_ONLY_LIVE_CONFIG_CALLS = new Set(
  EXPECTED_LIVE_CONFIG_CALLS.filter(
    (boundary) => !OPERATOR_DIAGNOSTIC_LIVE_CONFIG_CALLS.has(boundary),
  ),
);

const READ_ONLY_RECONCILIATION = new Set([
  "lib/external-execution/governed-draft-execution.ts:reconcileGovernedDraft:request.createClient",
  "lib/gmail-hub/service.ts:createReadOnlyReconciliationClient:this.createClient",
  "lib/lease-renewal/comp-screenshot-service.ts:reconcileCompScreenshot:deps.createProvider",
  "lib/vendor/live-lifecycle-adapters.ts:findInviteByRfcMessageId:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:readDisableState:this.createClient",
  "lib/vendor/live-lifecycle-runtime.ts:reconcile:this.createProvider",
]);

const READ_ONLY_WITH_GATED_MUTATION = new Set([
  // Status/readback is recovery. The unknown-result branch repeats the runtime gate immediately
  // before the provider-side absent-key tombstone.
  "lib/lease-renewal/sheet-writeback-service.ts:reconcileWriteback:deps.createWriter",
]);

const LAZY_PROVIDER_FACTORIES = new Set([
  "lib/gmail-hub/service.ts:createClient:this.dependencies.createClient",
  "lib/lease-renewal/comp-screenshot-runtime.ts:createProvider:new GoogleDriveRenewalCompScreenshotProvider",
  "lib/lease-renewal/execution/renewal-notice-draft-service.ts:createClient:deps.createGmailClient",
  "lib/lease-renewal/sheet-writeback-service.ts:createWriter:new GoogleSheetsApiWriter",
  "lib/maintenance/execution/owner-notice-draft-service.ts:createClient:deps.createGmailClient",
  "lib/notifications/internal-transactional-sender.ts:constructor:new GmailRuntimeClient",
  "lib/vendor/live-lifecycle-adapters.ts:constructor:new GmailRuntimeClient",
  "lib/vendor/live-lifecycle-runtime.ts:createLiveVendorLifecycleProvider:new LiveVendorLifecycleProvider",
]);

// Gmail dependency composition resolves one immutable environment descriptor before either
// factory can run. The provider constructor repeats the descriptor assertion; createStore only
// chooses the app state-store data mode and cannot perform a provider effect.
const DESCRIPTOR_BOUND_DEPENDENCY_FACTORIES = new Set([
  "lib/gmail-hub/dependencies.ts:createDescriptorBoundGmailRuntimeClient:construct",
  "lib/gmail-hub/dependencies.ts:createDescriptorBoundGmailRuntimeClient:new GmailRuntimeClient",
  "lib/gmail-hub/dependencies.ts:createGmailHubRuntimeDependencies:factories.createStore",
]);

const PRODUCT_READ_ONLY_PROVIDER_FACTORIES = new Set([
  "lib/lease-renewal/live-config.ts:buildLiveRenewalConfig:new GoogleSheetsApiReader",
  "lib/lease-renewal/live-config.ts:buildLiveRenewalConfig:new RentVineClient",
  "lib/lease-renewal/live-config.ts:buildLiveRentVineConfig:new RentVineClient",
]);

const LAZY_SCRIPT_PROVIDER_FACTORIES = new Set([
  "scripts/smoke-gmail-draft-live.ts:createGmailClient:new GmailRuntimeClient",
  "scripts/smoke-renewal-draft-live.ts:createDiagnosticProvider:new LiveRenewalGmailDraftProvider",
  "scripts/smoke-renewal-draft-live.ts:createGmailClient:new GmailRuntimeClient",
  "scripts/smoke-renewal-draft-live.ts:createRentVineClient:new RentVineClient",
  "scripts/smoke-sheet-write.ts:createWriter:new GoogleSheetsApiWriter",
]);

const EXACT_CONFIRMED_SCRIPT_PROVIDER_FACTORIES = new Set([
  // Copy-only proof: dry by default; operating/copy alias check and exact confirmation precede
  // construction; the proof writes one blank cell and exact-clears the synthetic marker.
  "scripts/prove-rehearsal-sheet-write.ts:main:new GoogleSheetsApiWriter",
]);

const READ_ONLY_DIAGNOSTIC_SCRIPT_BOUNDARIES = new Set([
  "scripts/capture-golden-data.ts:main:new GoogleSheetsApiReader",
  "scripts/capture-golden-data.ts:main:new RentVineClient",
  "scripts/capture-test-set-baseline.ts:main:new GoogleSheetsApiReader",
  "scripts/capture-test-set-baseline.ts:main:new RentVineClient",
  "scripts/discover-rentvine-fields.ts:main:new RentVineClient",
  "scripts/smoke-renewal-review.ts:main:new GoogleSheetsApiReader",
  "scripts/smoke-renewal-review.ts:main:new RentVineClient",
  "scripts/smoke-rentcast-comp.ts:main:new RentCastMarketCompProvider",
  "scripts/smoke-rentvine-read.ts:main:new RentVineClient",
  "scripts/smoke-sheet-read.ts:main:new GoogleSheetsApiReader",
]);

const OWNER_PROVISIONING_SCRIPT_BOUNDARIES = new Set([
  "scripts/ensure-maintenance-drive-folder.ts:main:new GoogleDriveClient",
  "scripts/import-agent-search-documents.mjs:ensureDataStore:dataStoreClient.createDataStore",
]);

// The exact one-Space provider effect is behind Admin auth, a closed-by-default runtime flag, an
// owner-approved immutable packet, exact confirmation, an idempotent claim, predecessor inventory
// proof, readback, and isolated rollback. The focused pilot tests prove refusal before provider work.
const EXACT_CONFIRMED_SPACE_PROVISIONING_BOUNDARIES = new Set([
  "lib/admin/space-provisioning-provider.ts:provisionDataStoreAndImportSource:this.dataStores.createDataStore",
]);

const GATED_PROVIDER_ADAPTERS = new Set([
  "app/api/gmail-hub/pubsub/route.ts:POST:dependencies.createClient",
  "app/api/lease-renewal/market-comps/route.ts:POST:createMarketCompProvider",
  "app/api/maintenance/photo/route.ts:POST:createMaintenanceImageStore",
  "lib/external-execution/governed-draft-execution.ts:executeGovernedDraft:request.createClient",
  "lib/gmail-hub/service.ts:connection:this.createClient",
  "lib/gmail-hub/service.ts:createRuntimeClient:this.createClient",
  "lib/gmail-hub/service.ts:runClaimedLabelMutation:this.createClient",
  "lib/gmail-hub/service.ts:runGovernedLabelEffect:this.createClient",
  "lib/gmail-hub/service.ts:sendConfirmed:this.createClient",
  "lib/gmail-hub/service.ts:watchMailbox:this.createClient",
  "lib/lease-renewal/comp-screenshot-service.ts:commitCompScreenshotRollback:deps.createProvider",
  "lib/lease-renewal/comp-screenshot-service.ts:getProvider:deps.createProvider",
  "lib/lease-renewal/comp-screenshot-service.ts:previewCompScreenshotRollback:deps.createProvider",
  "lib/lease-renewal/execution/renewal-draft-request.ts:executeRenewalNoticeDraft:createClient",
  "lib/lease-renewal/sheet-writeback-service.ts:commitCorrection:deps.createWriter",
  "lib/lease-renewal/sheet-writeback-service.ts:commitWriteback:deps.createWriter",
  "lib/lease-renewal/sheet-writeback-service.ts:previewCorrection:deps.createWriter",
  "lib/lease-renewal/sheet-writeback-service.ts:previewWriteback:deps.createWriter",
  "lib/maintenance/execution/owner-notice-draft-request.ts:executeMaintenanceOwnerNoticeDraft:createClient",
  "lib/notifications/internal-transactional-sender.ts:send:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:disableUser:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:ensureVendorPrincipal:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:revokeRefreshTokens:this.createClient",
  "lib/vendor/live-lifecycle-adapters.ts:sendInvite:this.createClient",
  "lib/vendor/live-lifecycle-runtime.ts:execute:this.createProvider",
  "scripts/smoke-gmail-draft-live.ts:runGmailDraftSmoke:dependencies.createGmailClient",
  "scripts/smoke-renewal-draft-live.ts:executeDiagnosticRenewalDraft:dependencies.createDiagnosticGmailClient",
  "scripts/smoke-renewal-draft-live.ts:executeDiagnosticRenewalDraft:dependencies.createDiagnosticProvider",
  "scripts/smoke-renewal-draft-live.ts:runLive:dependencies.createGmailClient",
  "scripts/smoke-renewal-draft-live.ts:runLive:dependencies.createRentVineClient",
  "scripts/smoke-sheet-write.ts:runSheetWriteSmoke:dependencies.createWriter",
]);

const DYNAMIC_REFUSAL_PROOFS = new Map([
  [
    "app/api/gmail-hub/pubsub/route.ts:POST:dependencies.createClient",
    {
      file: "tests/unit/gmail-hub-live-routes.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:gmail-pubsub-client",
    },
  ],
  [
    "app/api/lease-renewal/market-comps/route.ts:POST:createMarketCompProvider",
    {
      file: "tests/unit/market-comp-provider.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:market-comp-provider",
    },
  ],
  [
    "app/api/maintenance/photo/route.ts:POST:createMaintenanceImageStore",
    {
      file: "tests/unit/maintenance-photo-route.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:maintenance-photo-store",
    },
  ],
  [
    "lib/gmail-hub/service.ts:connection:this.createClient",
    {
      file: "tests/unit/gmail-hub-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:gmail-service-connection-client",
    },
  ],
  [
    "lib/gmail-hub/service.ts:createRuntimeClient:this.createClient",
    {
      file: "tests/unit/gmail-hub-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:gmail-service-runtime-client",
    },
  ],
  [
    "lib/external-execution/governed-draft-execution.ts:executeGovernedDraft:request.createClient",
    {
      file: "tests/unit/governed-draft-execution.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:governed-draft-execute-client",
    },
  ],
  [
    "lib/gmail-hub/service.ts:runGovernedLabelEffect:this.createClient",
    {
      file: "tests/unit/gmail-label-execution.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:gmail-label-read-client",
    },
  ],
  [
    "lib/gmail-hub/service.ts:runClaimedLabelMutation:this.createClient",
    {
      file: "tests/unit/gmail-label-execution.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:gmail-label-mutation-client",
    },
  ],
  [
    "lib/gmail-hub/service.ts:sendConfirmed:this.createClient",
    {
      file: "tests/unit/gmail-hub-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:gmail-service-confirmed-send-client",
    },
  ],
  [
    "lib/gmail-hub/service.ts:watchMailbox:this.createClient",
    {
      file: "tests/unit/gmail-hub-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:gmail-service-watch-client",
    },
  ],
  [
    "lib/lease-renewal/comp-screenshot-service.ts:commitCompScreenshotRollback:deps.createProvider",
    {
      file: "tests/unit/renewal-comp-screenshot-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:comp-screenshot-rollback-commit-provider",
    },
  ],
  [
    "lib/lease-renewal/comp-screenshot-service.ts:getProvider:deps.createProvider",
    {
      file: "tests/unit/renewal-comp-screenshot-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:comp-screenshot-main-provider",
    },
  ],
  [
    "lib/lease-renewal/comp-screenshot-service.ts:previewCompScreenshotRollback:deps.createProvider",
    {
      file: "tests/unit/renewal-comp-screenshot-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:comp-screenshot-rollback-preview-provider",
    },
  ],
  [
    "lib/lease-renewal/execution/renewal-draft-request.ts:executeRenewalNoticeDraft:createClient",
    {
      file: "tests/unit/renewal-draft-request.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:renewal-draft-request-client",
    },
  ],
  [
    "lib/lease-renewal/sheet-writeback-service.ts:commitCorrection:deps.createWriter",
    {
      file: "tests/unit/sheet-writeback-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:sheet-commit-correction-writer",
    },
  ],
  [
    "lib/lease-renewal/sheet-writeback-service.ts:commitWriteback:deps.createWriter",
    {
      file: "tests/unit/sheet-writeback-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:sheet-commit-writeback-writer",
    },
  ],
  [
    "lib/lease-renewal/sheet-writeback-service.ts:previewCorrection:deps.createWriter",
    {
      file: "tests/unit/sheet-writeback-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:sheet-preview-correction-writer",
    },
  ],
  [
    "lib/lease-renewal/sheet-writeback-service.ts:previewWriteback:deps.createWriter",
    {
      file: "tests/unit/sheet-writeback-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:sheet-preview-writeback-writer",
    },
  ],
  [
    "lib/maintenance/execution/owner-notice-draft-request.ts:executeMaintenanceOwnerNoticeDraft:createClient",
    {
      file: "tests/unit/maintenance-owner-notice-draft.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:maintenance-draft-request-client",
    },
  ],
  [
    "lib/notifications/internal-transactional-sender.ts:send:this.createClient",
    {
      file: "tests/unit/internal-transactional.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:internal-transactional-sender-client",
    },
  ],
  [
    "lib/vendor/live-lifecycle-adapters.ts:disableUser:this.createClient",
    {
      file: "tests/unit/vendor-live-lifecycle-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:vendor-disable-client",
    },
  ],
  [
    "lib/vendor/live-lifecycle-adapters.ts:ensureVendorPrincipal:this.createClient",
    {
      file: "tests/unit/vendor-live-lifecycle-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:vendor-ensure-client",
    },
  ],
  [
    "lib/vendor/live-lifecycle-adapters.ts:revokeRefreshTokens:this.createClient",
    {
      file: "tests/unit/vendor-live-lifecycle-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:vendor-revoke-client",
    },
  ],
  [
    "lib/vendor/live-lifecycle-adapters.ts:sendInvite:this.createClient",
    {
      file: "tests/unit/vendor-live-lifecycle-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:vendor-invite-client",
    },
  ],
  [
    "lib/vendor/live-lifecycle-runtime.ts:execute:this.createProvider",
    {
      file: "tests/unit/vendor-live-lifecycle-service.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:vendor-runtime-provider",
    },
  ],
  [
    "scripts/smoke-gmail-draft-live.ts:runGmailDraftSmoke:dependencies.createGmailClient",
    {
      file: "tests/unit/live-smoke-runtime-suspension.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:script-gmail-draft-client",
    },
  ],
  [
    "scripts/smoke-renewal-draft-live.ts:executeDiagnosticRenewalDraft:dependencies.createDiagnosticGmailClient",
    {
      file: "tests/unit/live-smoke-runtime-suspension.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:script-renewal-diagnostic-client",
    },
  ],
  [
    "scripts/smoke-renewal-draft-live.ts:executeDiagnosticRenewalDraft:dependencies.createDiagnosticProvider",
    {
      file: "tests/unit/live-smoke-runtime-suspension.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:script-renewal-diagnostic-provider",
    },
  ],
  [
    "scripts/smoke-renewal-draft-live.ts:runLive:dependencies.createGmailClient",
    {
      file: "tests/unit/live-smoke-runtime-suspension.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:script-renewal-gmail-client",
    },
  ],
  [
    "scripts/smoke-renewal-draft-live.ts:runLive:dependencies.createRentVineClient",
    {
      file: "tests/unit/live-smoke-runtime-suspension.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:script-renewal-rentvine-client",
    },
  ],
  [
    "scripts/smoke-sheet-write.ts:runSheetWriteSmoke:dependencies.createWriter",
    {
      file: "tests/unit/live-smoke-runtime-suspension.test.ts",
      marker: "S51_DYNAMIC_REFUSAL:script-sheet-write-writer",
    },
  ],
]);

const REQUIRED_DYNAMIC_REFUSAL_STATES = [
  "action_suspended",
  "global_suspended",
  "unreadable",
];

// This is deliberately separate from the marker text: a marker next to a test is not proof unless
// that same test also asserts that the named concrete factory stayed at zero for all three states.
const DYNAMIC_REFUSAL_FACTORY_ASSERTIONS = new Map([
  ["S51_DYNAMIC_REFUSAL:gmail-pubsub-client", "tracker.createClient"],
  ["S51_DYNAMIC_REFUSAL:market-comp-provider", "createProviderSpy"],
  ["S51_DYNAMIC_REFUSAL:maintenance-photo-store", "createStoreMock"],
  ["S51_DYNAMIC_REFUSAL:gmail-service-connection-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:gmail-service-runtime-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:gmail-service-confirmed-send-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:governed-draft-execute-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:gmail-label-read-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:gmail-label-mutation-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:gmail-service-watch-client", "createClient"],
  [
    "S51_DYNAMIC_REFUSAL:comp-screenshot-rollback-commit-provider",
    "harness.createProvider",
  ],
  ["S51_DYNAMIC_REFUSAL:comp-screenshot-main-provider", "harness.createProvider"],
  [
    "S51_DYNAMIC_REFUSAL:comp-screenshot-rollback-preview-provider",
    "harness.createProvider",
  ],
  ["S51_DYNAMIC_REFUSAL:renewal-draft-request-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:sheet-commit-correction-writer", "h.createWriter"],
  ["S51_DYNAMIC_REFUSAL:sheet-commit-writeback-writer", "h.createWriter"],
  ["S51_DYNAMIC_REFUSAL:sheet-preview-correction-writer", "h.createWriter"],
  ["S51_DYNAMIC_REFUSAL:sheet-preview-writeback-writer", "h.createWriter"],
  ["S51_DYNAMIC_REFUSAL:maintenance-draft-request-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:internal-transactional-sender-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:vendor-disable-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:vendor-ensure-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:vendor-revoke-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:vendor-invite-client", "createClient"],
  ["S51_DYNAMIC_REFUSAL:vendor-runtime-provider", "createProvider"],
  ["S51_DYNAMIC_REFUSAL:script-gmail-draft-client", "effects.createGmailClient"],
  [
    "S51_DYNAMIC_REFUSAL:script-renewal-diagnostic-client",
    "effects.createDiagnosticGmailClient",
  ],
  [
    "S51_DYNAMIC_REFUSAL:script-renewal-diagnostic-provider",
    "effects.createDiagnosticProvider",
  ],
  ["S51_DYNAMIC_REFUSAL:script-renewal-gmail-client", "effects.createGmailClient"],
  ["S51_DYNAMIC_REFUSAL:script-renewal-rentvine-client", "effects.createRentVineClient"],
  ["S51_DYNAMIC_REFUSAL:script-sheet-write-writer", "effects.createWriter"],
]);

// A zero-call assertion alone can be attached to a test that never invokes the reviewed boundary.
// Pin the concrete public entry point exercised by the same test statement as well.
const DYNAMIC_REFUSAL_ENTRYPOINTS = new Map([
  ["S51_DYNAMIC_REFUSAL:gmail-pubsub-client", ".POST("],
  ["S51_DYNAMIC_REFUSAL:market-comp-provider", "POST("],
  ["S51_DYNAMIC_REFUSAL:maintenance-photo-store", "POST("],
  ["S51_DYNAMIC_REFUSAL:gmail-service-connection-client", "hub.connection("],
  ["S51_DYNAMIC_REFUSAL:gmail-service-runtime-client", "hub.getThread("],
  ["S51_DYNAMIC_REFUSAL:gmail-service-confirmed-send-client", "hub.sendConfirmed("],
  ["S51_DYNAMIC_REFUSAL:governed-draft-execute-client", "executeGovernedDraft("],
  ["S51_DYNAMIC_REFUSAL:gmail-label-read-client", "applyThreadLabel("],
  ["S51_DYNAMIC_REFUSAL:gmail-label-mutation-client", "restoreThreadLabel("],
  ["S51_DYNAMIC_REFUSAL:gmail-service-watch-client", "hub.watchMailbox("],
  [
    "S51_DYNAMIC_REFUSAL:comp-screenshot-rollback-commit-provider",
    "commitCompScreenshotRollback(",
  ],
  ["S51_DYNAMIC_REFUSAL:comp-screenshot-main-provider", "commitCompScreenshot("],
  [
    "S51_DYNAMIC_REFUSAL:comp-screenshot-rollback-preview-provider",
    "previewCompScreenshotRollback(",
  ],
  ["S51_DYNAMIC_REFUSAL:renewal-draft-request-client", "executeRenewalNoticeDraft("],
  ["S51_DYNAMIC_REFUSAL:sheet-commit-correction-writer", "prepareOrCommitWriteback("],
  ["S51_DYNAMIC_REFUSAL:sheet-commit-writeback-writer", "prepareOrCommitWriteback("],
  ["S51_DYNAMIC_REFUSAL:sheet-preview-correction-writer", "prepareOrCommitWriteback("],
  ["S51_DYNAMIC_REFUSAL:sheet-preview-writeback-writer", "prepareOrCommitWriteback("],
  [
    "S51_DYNAMIC_REFUSAL:maintenance-draft-request-client",
    "executeMaintenanceOwnerNoticeDraft(",
  ],
  [
    "S51_DYNAMIC_REFUSAL:internal-transactional-sender-client",
    "sendInternalTransactionalNotice(",
  ],
  ["S51_DYNAMIC_REFUSAL:vendor-disable-client", "executeLiveVendorLifecycle("],
  ["S51_DYNAMIC_REFUSAL:vendor-ensure-client", "executeLiveVendorLifecycle("],
  ["S51_DYNAMIC_REFUSAL:vendor-revoke-client", "executeLiveVendorLifecycle("],
  ["S51_DYNAMIC_REFUSAL:vendor-invite-client", "executeLiveVendorLifecycle("],
  ["S51_DYNAMIC_REFUSAL:vendor-runtime-provider", "executeLiveVendorLifecycle("],
  ["S51_DYNAMIC_REFUSAL:script-gmail-draft-client", "runGmailDraftSmoke("],
  ["S51_DYNAMIC_REFUSAL:script-renewal-diagnostic-client", "runRenewalDraftSmoke("],
  ["S51_DYNAMIC_REFUSAL:script-renewal-diagnostic-provider", "runRenewalDraftSmoke("],
  ["S51_DYNAMIC_REFUSAL:script-renewal-gmail-client", "runRenewalDraftSmoke("],
  ["S51_DYNAMIC_REFUSAL:script-renewal-rentvine-client", "runRenewalDraftSmoke("],
  ["S51_DYNAMIC_REFUSAL:script-sheet-write-writer", "runSheetWriteSmoke("],
]);

function runtimeSources() {
  return RUNTIME_ROOTS.flatMap((root) => walk(join(ROOT, root)));
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(?:[cm]?[jt]s|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function functionName(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current) && current.name) {
      return current.name.getText();
    }
    if (ts.isConstructorDeclaration(current)) return "constructor";
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      if (
        (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) &&
        parent.name
      ) {
        return parent.name.getText();
      }
    }
  }
  return "<module>";
}

function isReviewedProviderModule(moduleSpecifier) {
  const normalized = moduleSpecifier.replaceAll("\\", "/");
  return REVIEWED_PROVIDER_MODULE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function importedProviderBindings(sourceFile, relativeFile) {
  const named = new Map();
  const namespaces = new Map();
  const isScript = relativeFile.startsWith("scripts/");
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause ||
      statement.importClause.isTypeOnly
    ) {
      continue;
    }
    const moduleSpecifier = statement.moduleSpecifier.text;
    const reviewed = isReviewedProviderModule(moduleSpecifier);
    const clause = statement.importClause;
    if (clause.name && (reviewed || isScript)) {
      named.set(clause.name.text, {
        exportedName: clause.name.text,
        reviewed,
      });
    }
    if (!clause.namedBindings) continue;
    if (ts.isNamespaceImport(clause.namedBindings)) {
      if (reviewed || isScript) {
        namespaces.set(clause.namedBindings.name.text, { reviewed });
      }
      continue;
    }
    for (const element of clause.namedBindings.elements) {
      if (element.isTypeOnly) continue;
      const exportedName = (element.propertyName ?? element.name).text;
      if (
        reviewed ||
        (isScript &&
          (PROVIDER_TYPE_PATTERN.test(exportedName) ||
            PROVIDER_FACTORY_NAME_PATTERN.test(exportedName)))
      ) {
        named.set(element.name.text, { exportedName, reviewed });
      }
    }
  }
  return { isScript, named, namespaces };
}

function importedLiveConfigBindings(sourceFile) {
  const named = new Map();
  const namespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text
        .replaceAll("\\", "/")
        .endsWith(LIVE_CONFIG_MODULE_SUFFIX) ||
      !statement.importClause ||
      statement.importClause.isTypeOnly
    ) {
      continue;
    }
    const bindings = statement.importClause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      const exportedName = (element.propertyName ?? element.name).text;
      if (LIVE_CONFIG_FACTORY_NAMES.has(exportedName)) {
        named.set(element.name.text, exportedName);
      }
    }
  }
  return { named, namespaces };
}

function importedLiveConfigFactoryName(expression, imports) {
  if (ts.isIdentifier(expression)) {
    return imports.named.get(expression.text) ?? null;
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    imports.namespaces.has(expression.expression.text) &&
    LIVE_CONFIG_FACTORY_NAMES.has(expression.name.text)
  ) {
    return expression.name.text;
  }
  return null;
}

function providerReturnType(typeNode) {
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return providerReturnType(typeNode.type);
  }
  if (ts.isTypeReferenceNode(typeNode)) {
    const name = typeNode.typeName.getText();
    return PROVIDER_TYPE_PATTERN.test(name);
  }
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.some(providerReturnType);
  }
  return false;
}

function isTypedProviderFactoryParameter(call) {
  if (!ts.isIdentifier(call.expression)) return false;
  for (let current = call.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current)) continue;
    const parameter = current.parameters.find(
      (candidate) =>
        ts.isIdentifier(candidate.name) && candidate.name.text === call.expression.text,
    );
    if (
      parameter?.type &&
      ts.isFunctionTypeNode(parameter.type) &&
      providerReturnType(parameter.type.type)
    ) {
      return true;
    }
  }
  return false;
}

function importedConstructorName(expression, imports) {
  if (ts.isIdentifier(expression)) {
    const binding = imports.named.get(expression.text);
    if (binding && PROVIDER_TYPE_PATTERN.test(binding.exportedName)) {
      return binding.exportedName;
    }
    return null;
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    const namespace = imports.namespaces.get(expression.expression.text);
    if (namespace && PROVIDER_TYPE_PATTERN.test(expression.name.text)) {
      return expression.name.text;
    }
  }
  return null;
}

function importedFactoryName(expression, imports) {
  if (ts.isIdentifier(expression)) {
    const binding = imports.named.get(expression.text);
    if (binding && PROVIDER_FACTORY_NAME_PATTERN.test(binding.exportedName)) {
      return binding.exportedName;
    }
    return null;
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    const namespace = imports.namespaces.get(expression.expression.text);
    if (namespace && PROVIDER_FACTORY_NAME_PATTERN.test(expression.name.text)) {
      return expression.name.text;
    }
  }
  return null;
}

function memberFactoryName(expression) {
  if (!ts.isPropertyAccessExpression(expression)) return null;
  const name = expression.name.text;
  if (
    PROVIDER_FACTORY_NAME_PATTERN.test(name) &&
    !ORCHESTRATION_FACTORY_WRAPPERS.has(name)
  ) {
    return expression.getText();
  }
  return null;
}

function collectBoundariesInSource(relativeFile, source) {
  const sourceFile = ts.createSourceFile(
    relativeFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativeFile.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = importedProviderBindings(sourceFile, relativeFile);
  const boundaries = [];
  const visit = (node) => {
    let symbol = null;
    if (ts.isNewExpression(node)) {
      const constructorName = importedConstructorName(node.expression, imports);
      if (constructorName) symbol = `new ${constructorName}`;
    } else if (ts.isCallExpression(node)) {
      symbol =
        importedFactoryName(node.expression, imports) ??
        (isTypedProviderFactoryParameter(node)
          ? node.expression.getText()
          : memberFactoryName(node.expression));
    }
    if (symbol) {
      boundaries.push(`${relativeFile}:${functionName(node)}:${symbol}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return boundaries;
}

function collectBoundaries() {
  const boundaries = [];
  for (const file of runtimeSources()) {
    const source = readFileSync(file, "utf8");
    const relativeFile = relative(ROOT, file).replaceAll("\\", "/");
    boundaries.push(...collectBoundariesInSource(relativeFile, source));
  }
  return boundaries.sort();
}

function collectLiveConfigCallsInSource(relativeFile, source) {
  const sourceFile = ts.createSourceFile(
    relativeFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativeFile.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = importedLiveConfigBindings(sourceFile);
  const boundaries = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const factory = importedLiveConfigFactoryName(node.expression, imports);
      if (factory) {
        boundaries.push(`${relativeFile}:${functionName(node)}:${factory}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return boundaries;
}

function collectLiveConfigCalls() {
  return runtimeSources()
    .flatMap((file) => {
      const relativeFile = relative(ROOT, file).replaceAll("\\", "/");
      return collectLiveConfigCallsInSource(relativeFile, readFileSync(file, "utf8"));
    })
    .sort();
}

function dynamicProofStatement(sourceFile, markerOffset) {
  let statement = null;
  const visit = (node) => {
    if (
      ts.isExpressionStatement(node) &&
      node.getFullStart() <= markerOffset &&
      markerOffset < node.end &&
      (!statement ||
        node.end - node.getFullStart() < statement.end - statement.getFullStart())
    ) {
      statement = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return statement?.getFullText(sourceFile) ?? null;
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasZeroFactoryAssertion(proofStatement, factoryName) {
  const compact = proofStatement.replace(/\s+/g, "");
  const factory = regexEscape(factoryName);
  return new RegExp(
    `expect\\([^)]*${factory}[^)]*\\)\\.(?:not\\.toHaveBeenCalled\\(\\)|toHaveBeenCalledTimes\\(0\\))`,
  ).test(compact);
}

describe("runtime suspension provider-construction boundary", () => {
  it("has no Product Test executor or isolated-workspace constructor", () => {
    const intentionalRetirementEvidence = new Set([
      "lib/operations/production-test-record-catalog.ts",
      "lib/operations/production-test-retirement.ts",
      "scripts/retire-production-test-records.ts",
    ]);
    const retiredMarkers = [
      "isolatedTestWorkspace",
      "createIsolatedTestWorkspace",
      "approval-test-fixtures",
      "publication/test-fixture",
      "lease-renewal/test-workflow",
      "maintenance/test-workflow",
      "vendor/test-mailbox",
      "release/synthetic-execution",
      "release/fake-acceptance",
    ];
    const offenders = runtimeSources().flatMap((file) => {
      const relativeFile = relative(ROOT, file).replaceAll("\\", "/");
      if (intentionalRetirementEvidence.has(relativeFile)) return [];
      const source = readFileSync(file, "utf8");
      return retiredMarkers
        .filter((marker) => source.includes(marker))
        .map((marker) => `${marker}: ${relativeFile}`);
    });

    expect(offenders).toEqual([]);
  }, 20_000);

  it("discovers aliased, namespace, typed-parameter, and structural provider factories", () => {
    const fixture = `
      import {
        GmailRuntimeClient as RenamedGmailClient,
      } from "@/lib/gmail-runtime/client";
      import {
        createMaintenanceImageStore as buildImageStore,
      } from "@/lib/maintenance/image-store";
      import {
        LiveVendorLifecycleProvider,
      } from "@/lib/vendor/live-lifecycle-provider";
      import * as sheets from "@/lib/google-sheets/write-client";

      function importedAliases() {
        new RenamedGmailClient();
        buildImageStore({});
        new sheets.GoogleSheetsApiWriter();
        new LiveVendorLifecycleProvider({});
      }

      function typedParameter(makeTransport: () => ExampleProvider) {
        return () => makeTransport();
      }

      function structuralMember(deps: {
        createFutureProvider(): ExampleProvider;
      }) {
        return deps.createFutureProvider();
      }
    `;
    expect(collectBoundariesInSource("lib/sentinel-fixture.ts", fixture).sort()).toEqual([
      "lib/sentinel-fixture.ts:importedAliases:createMaintenanceImageStore",
      "lib/sentinel-fixture.ts:importedAliases:new GmailRuntimeClient",
      "lib/sentinel-fixture.ts:importedAliases:new GoogleSheetsApiWriter",
      "lib/sentinel-fixture.ts:importedAliases:new LiveVendorLifecycleProvider",
      "lib/sentinel-fixture.ts:structuralMember:deps.createFutureProvider",
      "lib/sentinel-fixture.ts:typedParameter:makeTransport",
    ]);
  });

  it("discovers aliased and namespace live-config wrapper calls", () => {
    const fixture = `
      import {
        buildLiveRentVineConfig as buildRentVine,
      } from "@/lib/lease-renewal/live-config";
      import * as liveConfig from "@/lib/lease-renewal/live-config";

      function directAlias() {
        return buildRentVine();
      }

      function namespaceCall() {
        return liveConfig.buildLiveRenewalConfig();
      }
    `;
    expect(
      collectLiveConfigCallsInSource("lib/live-config-fixture.ts", fixture).sort(),
    ).toEqual([
      "lib/live-config-fixture.ts:directAlias:buildLiveRentVineConfig",
      "lib/live-config-fixture.ts:namespaceCall:buildLiveRenewalConfig",
    ]);
  });

  it("pins every live-config wrapper caller as Product read-only or operator diagnostic", () => {
    expect(collectLiveConfigCalls()).toEqual(EXPECTED_LIVE_CONFIG_CALLS);
    const classified = [
      ...PRODUCT_READ_ONLY_LIVE_CONFIG_CALLS,
      ...OPERATOR_DIAGNOSTIC_LIVE_CONFIG_CALLS,
    ];
    expect(new Set(classified).size).toBe(classified.length);
    expect(classified.sort()).toEqual(EXPECTED_LIVE_CONFIG_CALLS);
    expect([...OPERATOR_DIAGNOSTIC_LIVE_CONFIG_CALLS].sort()).toEqual([
      "lib/connections/verification.ts:buildTransport:buildLiveRenewalConfig",
      "lib/connections/verification.ts:buildTransport:buildLiveRentVineConfig",
      "scripts/diagnose-current-rent-truth.ts:diagnoseCurrentRentTruth:buildLiveRenewalConfig",
    ]);
    expect(PRODUCT_READ_ONLY_LIVE_CONFIG_CALLS.size).toBeGreaterThan(0);
  }, 20_000);

  it("requires every discovered reviewed-module provider factory to remain classified", () => {
    const actual = collectBoundaries();
    expect(actual).toEqual(EXPECTED_BOUNDARIES);
    const classified = [
      ...READ_ONLY_RECONCILIATION,
      ...READ_ONLY_WITH_GATED_MUTATION,
      ...LAZY_PROVIDER_FACTORIES,
      ...DESCRIPTOR_BOUND_DEPENDENCY_FACTORIES,
      ...PRODUCT_READ_ONLY_PROVIDER_FACTORIES,
      ...LAZY_SCRIPT_PROVIDER_FACTORIES,
      ...EXACT_CONFIRMED_SCRIPT_PROVIDER_FACTORIES,
      ...READ_ONLY_DIAGNOSTIC_SCRIPT_BOUNDARIES,
      ...OWNER_PROVISIONING_SCRIPT_BOUNDARIES,
      ...EXACT_CONFIRMED_SPACE_PROVISIONING_BOUNDARIES,
      ...GATED_PROVIDER_ADAPTERS,
    ];
    expect(new Set(classified).size).toBe(classified.length);
    expect(classified.sort()).toEqual(EXPECTED_BOUNDARIES);
    expect([...DESCRIPTOR_BOUND_DEPENDENCY_FACTORIES].sort()).toEqual([
      "lib/gmail-hub/dependencies.ts:createDescriptorBoundGmailRuntimeClient:construct",
      "lib/gmail-hub/dependencies.ts:createDescriptorBoundGmailRuntimeClient:new GmailRuntimeClient",
      "lib/gmail-hub/dependencies.ts:createGmailHubRuntimeDependencies:factories.createStore",
    ]);
    expect([...PRODUCT_READ_ONLY_PROVIDER_FACTORIES].sort()).toEqual([
      "lib/lease-renewal/live-config.ts:buildLiveRenewalConfig:new GoogleSheetsApiReader",
      "lib/lease-renewal/live-config.ts:buildLiveRenewalConfig:new RentVineClient",
      "lib/lease-renewal/live-config.ts:buildLiveRentVineConfig:new RentVineClient",
    ]);
    expect([...EXACT_CONFIRMED_SPACE_PROVISIONING_BOUNDARIES]).toEqual([
      "lib/admin/space-provisioning-provider.ts:provisionDataStoreAndImportSource:this.dataStores.createDataStore",
    ]);
  }, 20_000);

  it("pins one unique dynamic exact/global/unreadable zero-factory proof to every gated adapter", () => {
    expect([...DYNAMIC_REFUSAL_PROOFS.keys()].sort()).toEqual(
      [...GATED_PROVIDER_ADAPTERS].sort(),
    );
    expect([...DYNAMIC_REFUSAL_FACTORY_ASSERTIONS.keys()].sort()).toEqual(
      [...DYNAMIC_REFUSAL_PROOFS.values()].map(({ marker }) => marker).sort(),
    );
    expect([...DYNAMIC_REFUSAL_ENTRYPOINTS.keys()].sort()).toEqual(
      [...DYNAMIC_REFUSAL_PROOFS.values()].map(({ marker }) => marker).sort(),
    );

    const issues = [];
    const seenMarkers = new Set();
    for (const [boundary, proof] of DYNAMIC_REFUSAL_PROOFS) {
      if (!/^S51_DYNAMIC_REFUSAL:[a-z0-9-]+$/.test(proof.marker)) {
        issues.push(`${boundary}: invalid marker ${proof.marker}`);
      }
      if (seenMarkers.has(proof.marker)) {
        issues.push(`${boundary}: duplicate marker ${proof.marker}`);
      }
      seenMarkers.add(proof.marker);

      const proofPath = join(ROOT, proof.file);
      if (!existsSync(proofPath)) {
        issues.push(`${boundary}: missing proof file ${proof.file}`);
        continue;
      }
      const source = readFileSync(proofPath, "utf8");
      const occurrences = source.split(proof.marker).length - 1;
      if (occurrences !== 1) {
        issues.push(
          `${boundary}: expected exactly one ${proof.marker} marker in ${proof.file}, found ${occurrences}`,
        );
        continue;
      }

      const sourceFile = ts.createSourceFile(
        proof.file,
        source,
        ts.ScriptTarget.Latest,
        true,
        proof.file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const proofStatement = dynamicProofStatement(
        sourceFile,
        source.indexOf(proof.marker),
      );
      if (!proofStatement) {
        issues.push(
          `${boundary}: ${proof.marker} must be attached to an executable test statement`,
        );
        continue;
      }
      if (!/\b(?:it|test)(?:\.each)?\s*\(/.test(proofStatement)) {
        issues.push(
          `${boundary}: ${proof.marker} must be attached to a Vitest it/test statement`,
        );
      }
      const missingStates = REQUIRED_DYNAMIC_REFUSAL_STATES.filter(
        (state) =>
          !proofStatement.includes(`"${state}"`) &&
          !proofStatement.includes(`'${state}'`),
      );
      if (missingStates.length > 0) {
        issues.push(
          `${boundary}: ${proof.marker} test is missing states ${missingStates.join(", ")}`,
        );
      }
      const factoryName = DYNAMIC_REFUSAL_FACTORY_ASSERTIONS.get(proof.marker);
      if (!factoryName || !hasZeroFactoryAssertion(proofStatement, factoryName)) {
        issues.push(
          `${boundary}: ${proof.marker} test needs an inline zero-call assertion for ${factoryName ?? "its concrete factory"}`,
        );
      }
      const entrypoint = DYNAMIC_REFUSAL_ENTRYPOINTS.get(proof.marker);
      if (!entrypoint || !proofStatement.includes(entrypoint)) {
        issues.push(
          `${boundary}: ${proof.marker} test must invoke ${entrypoint ?? "its reviewed entry point"} in the same statement`,
        );
      }
    }
    expect(issues).toEqual([]);
  });
});
