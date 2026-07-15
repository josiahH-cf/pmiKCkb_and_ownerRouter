import { createHash } from "node:crypto";

import { DRAFT_BANNER } from "@/lib/constants";
import {
  externalPreviewHash,
  markIsolatedTestExecutor,
} from "@/lib/external-execution/orchestrator";
import type {
  ExternalActionDefinition,
  ExternalActionInput,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import {
  GMAIL_MANUAL_LABEL_RULE_REF,
  renderGovernedArtifactInstance,
} from "@/lib/gmail-hub/governed-artifacts";
import {
  BoomRenewalExecutor,
  DotloopRenewalExecutor,
  LeaseGmailExecutor,
  RenewalSheetExecutor,
  RentvineRenewalExecutor,
  type WorkflowMessagePayload,
} from "@/lib/lease-renewal/execution/providers";
import {
  LeadSimpleMaintenanceExecutor,
  MaintenanceOwnerEmailExecutor,
  MaintenancePhotoExecutor,
  QuickBooksDraftBillExecutor,
  RentvineWorkOrderExecutor,
  VendorLifecycleExecutor,
  VendorMailboxExecutor,
  type LeadSimpleProcessState,
  type LeadSimpleTaskState,
  type QuickBooksDraftBillState,
  type RentvineWorkOrderState,
} from "@/lib/maintenance/execution/providers";
import { buildWorkOrderDraft } from "@/lib/maintenance/work-order-draft";
import { VENDOR_OAUTH_SCOPES, type VendorOAuthScope } from "@/lib/vendor/model";

export const SYNTHETIC_V1_ALIASES = Object.freeze({
  adminUid: "admin-synthetic",
  internalMailbox: "workflow-synthetic@pmikcmetro.com",
  leaseWorkflow: "lease-synthetic-001",
  maintenanceWorkflow: "ticket-synthetic-001",
  tenantEmail: "tenant-synthetic@example.invalid",
  ownerEmail: "owner-synthetic@example.invalid",
  vendorEmail: "vendor-synthetic@example.invalid",
  vendorRef: "vendor-synthetic-001",
  vendorUid: "vendor-uid-synthetic-001",
  unitRef: "unit-synthetic-101",
  workOrderRef: "work-order-synthetic-001",
  folderRef: "folder-synthetic-001",
  threadRef: "thread-synthetic-001",
  leaseRef: "lease-synthetic-001",
  processRef: "process-synthetic-001",
  taskRef: "task-synthetic-001",
});

export type SyntheticLane = "lease" | "maintenance";

const SYNTHETIC_VENDOR_OAUTH_REDIRECT_URI =
  "https://example.invalid/vendor/oauth/callback";

const tenantArtifact = renderGovernedArtifactInstance({
  artifactRef: "tenant-renewal:v1.0",
  mailbox: {
    email: SYNTHETIC_V1_ALIASES.internalMailbox,
    sourceRef: "fixture:mailbox",
    verified: true,
  },
  recipient: {
    email: SYNTHETIC_V1_ALIASES.tenantEmail,
    sourceRef: "fixture:tenant",
    verified: true,
  },
  sourceRefs: ["fixture:renewal-workflow"],
  values: {
    tenantNameLabel: "Synthetic Resident",
    leaseEndDateIso: "2026-12-31",
    offeredRent: 1_500,
    ownerDecision: "increase",
    infoFormUrl: "https://example.invalid/renewal-form",
  },
});

const maintenanceArtifact = renderGovernedArtifactInstance({
  artifactRef: "maintenance-owner:v1.0",
  mailbox: {
    email: SYNTHETIC_V1_ALIASES.internalMailbox,
    sourceRef: "fixture:mailbox",
    verified: true,
  },
  recipient: {
    email: SYNTHETIC_V1_ALIASES.ownerEmail,
    sourceRef: "fixture:owner",
    verified: true,
  },
  sourceRefs: ["fixture:maintenance-workflow"],
  values: {
    ownerName: "Synthetic Owner",
    workOrder: buildWorkOrderDraft({
      reporterUid: "reporter-synthetic",
      typedNote: "Synthetic kitchen sink leak",
      unit: {
        unitId: SYNTHETIC_V1_ALIASES.unitRef,
        label: "100 Synthetic Street, Unit 101",
        confidence: "Verified",
      },
      photoRefs: [],
      capturedAt: "2026-07-14T00:00:00.000Z",
    }),
  },
});

if (
  tenantArtifact.status !== "ready" ||
  tenantArtifact.rendered.kind !== "tenant_renewal_offer" ||
  maintenanceArtifact.status !== "ready" ||
  maintenanceArtifact.rendered.kind !== "maintenance_owner_notice"
) {
  throw new Error("The synthetic V1 governed-artifact fixtures are not ready.");
}

const tenantEmail = tenantArtifact.rendered.channels.email;
const tenantPortal = tenantArtifact.rendered.channels.portal_chat;
const tenantText = tenantArtifact.rendered.channels.text;
const maintenanceNotice = maintenanceArtifact.rendered;

export function buildSyntheticActionInput(
  lane: SyntheticLane,
  key: string,
  index: number,
  definition: ExternalActionDefinition,
): ExternalActionInput {
  const workflowId =
    lane === "lease"
      ? SYNTHETIC_V1_ALIASES.leaseWorkflow
      : SYNTHETIC_V1_ALIASES.maintenanceWorkflow;
  const vendorMailboxAction = key.startsWith("vendor.gmail.");
  const actor = vendorMailboxAction
    ? ({ role: "Vendor" as const, uid: SYNTHETIC_V1_ALIASES.vendorUid } as const)
    : ({ role: "Admin" as const, uid: SYNTHETIC_V1_ALIASES.adminUid } as const);
  const actionId = `action-${index}`;
  const base: ExternalActionInput = {
    dataMode: "test",
    workflowId,
    actionId,
    actionKey: key,
    values: syntheticValues(lane, key, actionId),
    sourceRefs: ["source:synthetic:v1-acceptance"],
    contractRef: "documented:fake:integrated-v1",
    connectionRef: "connection:fake:v1",
    mappingRef:
      key === "google_drive.maintenance_photo.store"
        ? `mapping:ticket-folder:${workflowId}:${SYNTHETIC_V1_ALIASES.folderRef}`
        : "mapping:fake:v1",
    authority: {
      actor,
      roleScopeAuthorized: true,
      technical: {
        connectionReady: true,
        documentedEvidence: true,
        endpointDocumented: true,
        permissionGranted: true,
        productionAllowed: true,
        requiredValuesPresent: true,
        roleScopeAuthorized: true,
        sourceValidated: true,
      },
      communication: {
        bulk: false,
        governedLabel: true,
        humanInitiated: true,
        mailboxScopeAuthorized: true,
        modelTriggered: false,
        recipientMatchesPreview: true,
        reversible: true,
        scheduled: false,
        workflowLinked: true,
      },
      ...(vendorMailboxAction
        ? {
            vendor: {
              assignedTicket: true,
              sameMailbox: true,
              selfConsent: true,
              verifiedEmailTotp: true,
            },
          }
        : {}),
    },
  };
  const previewHash = externalPreviewHash(base);
  base.authority = {
    ...base.authority!,
    ...(definition.risk === "Medium" ? { exactConfirmationHash: previewHash } : {}),
    ...(definition.risk === "High" && actor.role !== "Vendor"
      ? {
          approval: {
            approvedByRole: "Admin",
            approvedByUid: SYNTHETIC_V1_ALIASES.adminUid,
            previewHash,
            reason: "Synthetic provider acceptance with non-routable aliases.",
          },
        }
      : {}),
  };
  return base;
}

function syntheticValues(
  lane: SyntheticLane,
  key: string,
  actionId: string,
): Readonly<Record<string, string | number | boolean>> {
  const a = SYNTHETIC_V1_ALIASES;
  switch (key) {
    case "gmail.renewal_notice.draft_create":
      return {
        workflow_context: `renewal:${a.leaseRef}`,
        template_ref: "tenant-renewal:v1.0",
        from: a.internalMailbox,
        to: a.tenantEmail,
        subject: tenantEmail.subject ?? "Synthetic renewal",
        body: tenantEmail.body.startsWith(DRAFT_BANNER)
          ? tenantEmail.body
          : `${DRAFT_BANNER}\n\n${tenantEmail.body}`,
        recipient_source_ref: "fixture:tenant",
        mailbox_source_ref: "fixture:mailbox",
        draft_banner_present: true,
      };
    case "gmail.renewal_notice.send":
      return {
        workflow_context: `renewal:${a.leaseRef}`,
        template_ref: "tenant-renewal:v1.0",
        from: a.internalMailbox,
        to: a.tenantEmail,
        subject: tenantEmail.subject ?? "Synthetic renewal",
        body: tenantEmail.body,
        recipient_source_ref: "fixture:tenant",
        mailbox_source_ref: "fixture:mailbox",
        rfc_message_id: "<renewal-synthetic@example.invalid>",
      };
    case "gmail.thread.reply":
      return {
        workflow_context:
          lane === "lease"
            ? `renewal:${a.leaseRef}`
            : `maintenance:${a.maintenanceWorkflow}:${a.unitRef}`,
        template_ref: lane === "lease" ? "tenant-renewal:v1.0" : "maintenance-owner:v1.0",
        from: a.internalMailbox,
        recipients: lane === "lease" ? a.tenantEmail : a.ownerEmail,
        subject:
          lane === "lease"
            ? (tenantEmail.subject ?? "Synthetic renewal")
            : maintenanceNotice.subject,
        body: lane === "lease" ? tenantEmail.body : maintenanceNotice.body,
        thread_ref: a.threadRef,
        rfc_message_id: `<${lane}-reply-synthetic@example.invalid>`,
      };
    case "gmail.label.apply":
      return {
        thread_ref: a.threadRef,
        workflow_context: `renewal:${a.leaseRef}`,
        suggested_label: "Waiting on Outside",
        rule_ref: GMAIL_MANUAL_LABEL_RULE_REF,
        reason: "Synthetic human-reviewed workflow label.",
      };
    case "rentvine.renewal.portal_message.send":
      return {
        workflow_context: `renewal:${a.leaseRef}`,
        recipient: "resident-synthetic-001",
        thread_ref: "portal-thread-synthetic-001",
        template_ref: "tenant-renewal:v1.0",
        body: tenantPortal.body,
      };
    case "sms.renewal_message.send":
      return {
        workflow_context: `renewal:${a.leaseRef}`,
        recipient: "+15555550101",
        sender: "+15555550102",
        template_ref: "tenant-renewal:v1.0",
        body: tenantText.body,
        consent_ref: "fixture:sms-consent",
      };
    case "google_sheets.renewal_checklist.writeback":
      return {
        tab: "Renewals",
        row_key: a.leaseRef,
        column: "Status",
        before_value: "Pending",
        after_value: "Approved",
        source_of_value: "fixture:approved-renewal-decision",
        verification_link: "https://example.invalid/renewal-verification",
      };
    case "dotloop.loop.create_from_template":
      return {
        workflow_context: `renewal:${a.leaseRef}`,
        template_ref: "dotloop-template-synthetic-001",
        participant_refs: "owner-synthetic-001,tenant-synthetic-001",
      };
    case "dotloop.document.upload":
      return {
        loop_ref: "loop-synthetic-001",
        document_ref: "document-synthetic-001",
        document_type: "lease-renewal",
        content_hash: sha256("synthetic renewal document"),
      };
    case "rentvine.lease.renewal_writeback":
      return {
        lease_ref: a.leaseRef,
        current_rent: 1_400,
        new_rent: 1_500,
        effective_date: "2027-01-01",
        lease_end_date: "2027-12-31",
        fee_cents: 0,
      };
    case "boom.resident.enroll":
      return {
        applicable: true,
        resident_ref: "resident-synthetic-001",
        rule_ref: "fixture:boom-applicability-v1",
      };
    case "vendor.account.invite":
      return {
        vendor_email: a.vendorEmail,
        ticket_ref: a.maintenanceWorkflow,
        artifact_ref: "vendor-invite:v1.0",
        reason: "Synthetic Vendor onboarding acceptance.",
      };
    case "vendor.account.disable":
      return {
        vendor_ref: a.vendorRef,
        vendor_uid: a.vendorUid,
        reason: "Synthetic Vendor offboarding acceptance.",
      };
    case "vendor.assignment.change":
      return {
        vendor_ref: a.vendorRef,
        ticket_ref: a.maintenanceWorkflow,
        assignment_operation: "assign",
        reason: "Synthetic assigned-ticket acceptance.",
      };
    case "vendor.gmail.connect":
      return {
        vendor_ref: a.vendorRef,
        mailbox_email: a.vendorEmail,
        oauth_scopes: VENDOR_OAUTH_SCOPES.join(" "),
        redirect_uri: SYNTHETIC_VENDOR_OAUTH_REDIRECT_URI,
      };
    case "vendor.gmail.revoke":
      return {
        vendor_ref: a.vendorRef,
        mailbox_email: a.vendorEmail,
        reason: "Synthetic Vendor mailbox offboarding.",
      };
    case "vendor.gmail.health":
      return { vendor_ref: a.vendorRef, mailbox_email: a.vendorEmail };
    case "google_drive.maintenance_photo.store":
      return {
        ticket_ref: a.maintenanceWorkflow,
        folder_ref: a.folderRef,
        server_filename: `${a.maintenanceWorkflow}/${actionId}.png`,
        mime_type: "image/png",
        size_bytes: 4_096,
        content_hash: sha256("synthetic photo bytes"),
        assigned_ticket: true,
        malware_scan_passed: true,
        sensitivity_scan_passed: true,
        append_only: true,
      };
    case "rentvine.work_order.create":
      return {
        property_unit: a.unitRef,
        vendor_trade: "trade-plumbing-synthetic",
        description: "Synthetic kitchen sink leak",
        priority: "Normal",
        expected_status: "Open",
      };
    case "rentvine.work_order.assign_vendor":
      return {
        work_order_id: a.workOrderRef,
        current_vendor: "unassigned",
        target_vendor: a.vendorRef,
        current_status: "Open",
        reason: "Synthetic approved Vendor assignment.",
      };
    case "rentvine.work_order.update_status":
      return {
        work_order_id: a.workOrderRef,
        current_status: "Open",
        target_status: "Closed",
        completion_evidence: true,
        financial_checks_passed: true,
        owner_checks_passed: true,
      };
    case "gmail.maintenance_owner_notice.send":
      return {
        workflow_context: `maintenance:${a.maintenanceWorkflow}:${a.unitRef}`,
        ticket_ref: a.maintenanceWorkflow,
        template_ref: "maintenance-owner:v1.0",
        from: a.internalMailbox,
        recipients: a.ownerEmail,
        subject: maintenanceNotice.subject,
        body: maintenanceNotice.body,
        recipient_source_ref: "fixture:owner",
        mailbox_source_ref: "fixture:mailbox",
        rfc_message_id: "<maintenance-synthetic@example.invalid>",
      };
    case "vendor.gmail.thread.read":
      return vendorThreadValues();
    case "vendor.gmail.draft.create":
      return {
        ...vendorThreadValues(),
        recipient: "coordinator-synthetic@example.invalid",
        template_ref: "vendor-ticket-reply:v1.0",
        body: "Synthetic assigned-ticket draft.",
      };
    case "vendor.gmail.thread.reply":
      return {
        ...vendorThreadValues(),
        recipient: "coordinator-synthetic@example.invalid",
        template_ref: "vendor-ticket-reply:v1.0",
        body: "Synthetic exact-confirmed assigned-ticket reply.",
        rfc_message_id: "<vendor-reply-synthetic@example.invalid>",
      };
    case "vendor.gmail.label.apply":
      return {
        ...vendorThreadValues(),
        suggested_label: "PMI/Vendor/Waiting",
        rule_ref: "vendor-assigned-ticket-label:v1",
        reason: "Synthetic assigned-ticket label acceptance.",
      };
    case "leadsimple.process.update_stage":
      return {
        process_id: a.processRef,
        current_stage: "New",
        target_stage: "In Progress",
      };
    case "leadsimple.task.create":
      return {
        process_id: a.processRef,
        task_ref: a.taskRef,
        task_title: "Synthetic maintenance follow-up",
        assignee_ref: "assignee-synthetic-001",
        due_date: "2026-07-21",
      };
    case "quickbooks.bill.create_draft":
      return {
        vendor: a.vendorRef,
        amount: 12_500,
        currency: "USD",
        account: "repairs-account-synthetic",
        rentvine_work_order_number: a.workOrderRef,
        property_unit: a.unitRef,
      };
    default:
      throw new Error(`No synthetic typed preview exists for ${key}.`);
  }
}

function vendorThreadValues() {
  const a = SYNTHETIC_V1_ALIASES;
  return {
    vendor_ref: a.vendorRef,
    mailbox_email: a.vendorEmail,
    ticket_ref: a.maintenanceWorkflow,
    thread_ref: a.threadRef,
  };
}

export function createSyntheticExecutorHarness() {
  const callCounts = new Map<string, number>();
  const called = (operation: string) => {
    callCounts.set(operation, (callCounts.get(operation) ?? 0) + 1);
  };

  const messageProvider = {
    execute: async (
      input: WorkflowMessagePayload & {
        idempotencyKey: string;
        expectedRfcMessageId?: string;
      },
    ) => {
      called(`message.${input.operation}`);
      const { expectedRfcMessageId, idempotencyKey, ...payload } = input;
      return {
        providerRef: `message:${sha256(idempotencyKey).slice(0, 16)}`,
        ...(expectedRfcMessageId ? { rfcMessageId: expectedRfcMessageId } : {}),
        ...(input.consentRef ? { consentRef: input.consentRef } : {}),
        payload,
      };
    },
    reconcile: async () => null,
    verifySmsConsent: async () => true,
  };

  let sheetValue = "Pending";
  const sheetProvider = {
    resolveCell: async (input: { tab: string; rowKey: string; column: string }) => ({
      cell: `${input.tab}!${input.rowKey}:${input.column}`,
      value: sheetValue,
    }),
    compareAndSetCell: async (input: { expectedValue: string; value: string }) => {
      called("sheets.write");
      if (sheetValue !== input.expectedValue) return { applied: false };
      sheetValue = input.value;
      return { applied: true };
    },
    readCell: async () => sheetValue,
  };

  const renewalRecords = new Map<string, Readonly<Record<string, unknown>>>([
    [
      SYNTHETIC_V1_ALIASES.leaseRef,
      {
        lease_ref: SYNTHETIC_V1_ALIASES.leaseRef,
        current_rent: 1_400,
      },
    ],
  ]);
  const renewalIdempotency = new Map<string, string>();
  const renewalProvider = {
    compareAndSetRenewal: async (input: {
      recordRef: string;
      expectedLeaseRef: string;
      expectedCurrentRent: number;
      values: Readonly<Record<string, string | number | boolean>>;
      idempotencyKey: string;
    }) => {
      called("rentvine.renewal_writeback");
      const current = renewalRecords.get(input.recordRef);
      if (
        current?.lease_ref !== input.expectedLeaseRef ||
        current.current_rent !== input.expectedCurrentRent
      ) {
        return { providerRef: input.recordRef, applied: false };
      }
      renewalRecords.set(input.recordRef, input.values);
      renewalIdempotency.set(input.idempotencyKey, input.recordRef);
      return { providerRef: input.recordRef, applied: true };
    },
    read: async (providerRef: string) => renewalRecords.get(providerRef) ?? null,
    findByIdempotencyKey: async (idempotencyKey: string) => {
      const providerRef = renewalIdempotency.get(idempotencyKey);
      const values = providerRef ? renewalRecords.get(providerRef) : undefined;
      return providerRef && values ? { providerRef, values } : null;
    },
  };

  const dotloopProvider = {
    createLoop: async () => {
      called("dotloop.loop_create");
      return { loopRef: "loop-synthetic-001" };
    },
    uploadDocument: async (input: { documentRef: string }) => {
      called("dotloop.document_upload");
      return { documentRef: input.documentRef };
    },
    reconcile: async () => null,
  };

  const boomProvider = {
    enroll: async () => {
      called("boom.enroll");
      return { enrollmentRef: "enrollment-synthetic-001" };
    },
    reconcile: async () => null,
  };

  const photoProvider = {
    append: async (input: {
      folderId: string;
      filename: string;
      contentHash: string;
    }) => {
      called("drive.photo_append");
      return { fileRef: "photo-synthetic-001", ...input };
    },
    reconcile: async () => null,
  };

  let workOrder: RentvineWorkOrderState | null = null;
  const workOrderProvider = {
    create: async (input: {
      propertyUnitRef: string;
      vendorTradeRef: string;
      description: string;
      priority: string;
      expectedStatus: string;
    }) => {
      called("rentvine.work_order_create");
      workOrder = {
        workOrderRef: SYNTHETIC_V1_ALIASES.workOrderRef,
        status: input.expectedStatus,
        propertyUnitRef: input.propertyUnitRef,
        vendorTradeRef: input.vendorTradeRef,
        descriptionHash: sha256(input.description),
        priority: input.priority,
      };
      return { workOrderRef: workOrder.workOrderRef };
    },
    assignVendor: async (input: {
      workOrderRef: string;
      expectedStatus: string;
      expectedVendorRef: string;
      vendorRef: string;
    }) => {
      called("rentvine.work_order_assign");
      const applied = Boolean(
        workOrder &&
        workOrder.workOrderRef === input.workOrderRef &&
        workOrder.status === input.expectedStatus &&
        (workOrder.vendorRef ?? "unassigned") === input.expectedVendorRef,
      );
      if (applied && workOrder) workOrder = { ...workOrder, vendorRef: input.vendorRef };
      return { workOrderRef: input.workOrderRef, applied };
    },
    updateStatus: async (input: {
      workOrderRef: string;
      expectedStatus: string;
      targetStatus: string;
    }) => {
      called("rentvine.work_order_status");
      const applied = Boolean(
        workOrder &&
        workOrder.workOrderRef === input.workOrderRef &&
        workOrder.status === input.expectedStatus,
      );
      if (applied && workOrder) workOrder = { ...workOrder, status: input.targetStatus };
      return { workOrderRef: input.workOrderRef, applied };
    },
    read: async () => workOrder,
    reconcile: async () => null,
  };

  let processState: LeadSimpleProcessState = {
    processRef: SYNTHETIC_V1_ALIASES.processRef,
    stageRef: "New",
  };
  let taskState: LeadSimpleTaskState | null = null;
  const leadSimpleProvider = {
    readProcess: async (processRef: string) =>
      processRef === processState.processRef ? processState : null,
    updateStage: async (input: {
      processRef: string;
      expectedStageRef: string;
      targetStageRef: string;
    }) => {
      called("leadsimple.stage_update");
      if (
        processState.processRef !== input.processRef ||
        processState.stageRef !== input.expectedStageRef
      ) {
        return { processRef: input.processRef, applied: false };
      }
      processState = { processRef: input.processRef, stageRef: input.targetStageRef };
      return { processRef: input.processRef, applied: true };
    },
    createTask: async (input: {
      processRef: string;
      taskRef: string;
      title: string;
      assigneeRef: string;
      dueDate: string;
    }) => {
      called("leadsimple.task_create");
      taskState = input;
      return { taskRef: input.taskRef };
    },
    readTask: async (taskRef: string) =>
      taskState?.taskRef === taskRef ? taskState : null,
    reconcileStage: async () => null,
    reconcileTask: async () => null,
  };

  let billState: QuickBooksDraftBillState | null = null;
  const quickBooksProvider = {
    createDraftBill: async (input: {
      vendorRef: string;
      accountRef: string;
      workOrderRef: string;
      propertyUnitRef: string;
      amountCents: number;
      currency: "USD";
    }) => {
      called("quickbooks.draft_bill");
      billState = {
        billRef: "bill-synthetic-001",
        status: "Draft",
        ...input,
      };
      return { billRef: billState.billRef, status: billState.status };
    },
    readDraftBill: async () => billState,
  };

  const lifecycleProvider = {
    invite: async (input: { email: string; ticketRef: string }) => {
      called("vendor.account_invite");
      return {
        providerRef: SYNTHETIC_V1_ALIASES.vendorRef,
        state: "pending_setup" as const,
        vendorEmail: input.email,
        ticketRef: input.ticketRef,
      };
    },
    disable: async (input: { vendorRef: string; vendorUid: string }) => {
      called("vendor.account_disable");
      return {
        providerRef: SYNTHETIC_V1_ALIASES.vendorRef,
        state: "disabled" as const,
        vendorRef: input.vendorRef,
        vendorUid: input.vendorUid,
      };
    },
    changeAssignment: async (input: {
      vendorRef: string;
      ticketRef: string;
      operation: "assign" | "remove";
    }) => {
      called("vendor.assignment_change");
      return {
        providerRef: SYNTHETIC_V1_ALIASES.vendorRef,
        state:
          input.operation === "assign" ? ("assigned" as const) : ("removed" as const),
        vendorRef: input.vendorRef,
        ticketRef: input.ticketRef,
        operation: input.operation,
      };
    },
    reconcile: async () => null,
  };

  const mailboxResult = (input: {
    vendorRef: string;
    mailbox: string;
    ticketRef?: string;
    threadRef?: string;
    payloadHash?: string;
    messageId?: string;
    label?: string;
    status?: "connected" | "revocation_pending" | "revoked";
    scopes?: readonly VendorOAuthScope[];
  }) => ({
    providerRef: `vendor-mail:${sha256(JSON.stringify(input)).slice(0, 16)}`,
    ...input,
  });
  const vendorMailboxProvider = {
    connect: async (input: {
      vendorRef: string;
      mailbox: string;
      oauthScopes: readonly VendorOAuthScope[];
    }) => {
      called("vendor.gmail_connect");
      return mailboxResult({
        vendorRef: input.vendorRef,
        mailbox: input.mailbox,
        status: "connected",
        scopes: input.oauthScopes,
      });
    },
    revoke: async (input: { vendorRef: string; mailbox: string }) => {
      called("vendor.gmail_revoke");
      return mailboxResult({
        vendorRef: input.vendorRef,
        mailbox: input.mailbox,
        status: "revoked",
      });
    },
    health: async (input: { vendorRef: string; mailbox: string }) => {
      called("vendor.gmail_health");
      return mailboxResult({
        vendorRef: input.vendorRef,
        mailbox: input.mailbox,
        status: "connected",
      });
    },
    readThread: async (input: {
      vendorRef: string;
      mailbox: string;
      ticketRef: string;
      threadRef: string;
    }) => {
      called("vendor.gmail_thread_read");
      return mailboxResult(input);
    },
    createDraft: async (input: {
      vendorRef: string;
      mailbox: string;
      ticketRef: string;
      threadRef: string;
      payloadHash: string;
    }) => {
      called("vendor.gmail_draft_create");
      return mailboxResult(input);
    },
    sendReply: async (input: {
      vendorRef: string;
      mailbox: string;
      ticketRef: string;
      threadRef: string;
      payloadHash: string;
      messageId: string;
    }) => {
      called("vendor.gmail_reply");
      return mailboxResult(input);
    },
    applyLabel: async (input: {
      vendorRef: string;
      mailbox: string;
      ticketRef: string;
      threadRef: string;
      label: string;
    }) => {
      called("vendor.gmail_label");
      return mailboxResult(input);
    },
    reconcile: async () => null,
  };

  const leaseMessage = new LeaseGmailExecutor(messageProvider);
  const maintenanceMessage = new MaintenanceOwnerEmailExecutor(messageProvider);
  const leaseExecutors = new Map<string, ExternalExecutor>([
    ["gmail.renewal_notice.draft_create", leaseMessage],
    ["gmail.renewal_notice.send", leaseMessage],
    ["gmail.thread.reply", leaseMessage],
    ["gmail.label.apply", leaseMessage],
    ["rentvine.renewal.portal_message.send", leaseMessage],
    ["sms.renewal_message.send", leaseMessage],
    [
      "google_sheets.renewal_checklist.writeback",
      new RenewalSheetExecutor(sheetProvider),
    ],
    ["dotloop.loop.create_from_template", new DotloopRenewalExecutor(dotloopProvider)],
    ["dotloop.document.upload", new DotloopRenewalExecutor(dotloopProvider)],
    ["rentvine.lease.renewal_writeback", new RentvineRenewalExecutor(renewalProvider)],
    ["boom.resident.enroll", new BoomRenewalExecutor(boomProvider)],
  ]);

  const lifecycle = new VendorLifecycleExecutor(lifecycleProvider);
  const vendorMailbox = new VendorMailboxExecutor(vendorMailboxProvider, {
    // Production rejects arbitrary OAuth callbacks. The isolated Test workspace still
    // supplies one exact, non-routable callback so it exercises the production validator.
    expectedRedirectUri: SYNTHETIC_VENDOR_OAUTH_REDIRECT_URI,
  });
  const rentvineWorkOrder = new RentvineWorkOrderExecutor(workOrderProvider);
  const leadSimple = new LeadSimpleMaintenanceExecutor(leadSimpleProvider);
  const maintenanceExecutors = new Map<string, ExternalExecutor>([
    ["vendor.account.invite", lifecycle],
    ["vendor.account.disable", lifecycle],
    ["vendor.assignment.change", lifecycle],
    ["vendor.gmail.connect", vendorMailbox],
    ["vendor.gmail.revoke", vendorMailbox],
    ["vendor.gmail.health", vendorMailbox],
    ["vendor.gmail.thread.read", vendorMailbox],
    ["vendor.gmail.draft.create", vendorMailbox],
    ["vendor.gmail.thread.reply", vendorMailbox],
    ["vendor.gmail.label.apply", vendorMailbox],
    ["google_drive.maintenance_photo.store", new MaintenancePhotoExecutor(photoProvider)],
    ["rentvine.work_order.create", rentvineWorkOrder],
    ["rentvine.work_order.assign_vendor", rentvineWorkOrder],
    ["rentvine.work_order.update_status", rentvineWorkOrder],
    ["gmail.maintenance_owner_notice.send", maintenanceMessage],
    ["gmail.thread.reply", maintenanceMessage],
    ["leadsimple.process.update_stage", leadSimple],
    ["leadsimple.task.create", leadSimple],
    ["quickbooks.bill.create_draft", new QuickBooksDraftBillExecutor(quickBooksProvider)],
  ]);

  return {
    leaseExecutors: brandTestExecutors(leaseExecutors),
    maintenanceExecutors: brandTestExecutors(maintenanceExecutors),
    providerCallCount: () =>
      [...callCounts.values()].reduce((total, count) => total + count, 0),
    providerOperations: () => [...callCounts.keys()].sort(),
  };
}

function brandTestExecutors(executors: ReadonlyMap<string, ExternalExecutor>) {
  return new Map(
    [...executors.entries()].map(([key, executor]) => [
      key,
      markIsolatedTestExecutor(executor),
    ]),
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
