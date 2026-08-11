import type { Firestore } from "firebase-admin/firestore";

import { AuthError, type AuthenticatedUser } from "@/lib/auth/session";
import { getApprovalQueueItem } from "@/lib/firestore/approval-queue";
import { getRenewalProgress } from "@/lib/firestore/lease-renewal-progress";
import { getMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { getWorkflowRun } from "@/lib/firestore/workflows";
import { getLiveLeaseSnapshot } from "@/lib/lease-renewal/live-lease-cache";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import {
  canonicalSourceLink,
  normalizeOpaqueId,
  unverifiedSource,
} from "@/lib/work-accountability/model";
import type {
  WorkSourceReference,
  WorkSourceType,
} from "@/lib/work-accountability/types";
import {
  assertSpaceIdAccess,
  mappedSpaceIdForProcessDefinitionId,
} from "@/lib/space-scope-resources";

export interface WorkSourceResolution {
  source: WorkSourceReference;
  space_id?: string;
}

export interface WorkSourceResolver {
  resolve(
    actor: AuthenticatedUser,
    input: { type: WorkSourceType; id?: string; space_id: string },
  ): Promise<WorkSourceResolution>;
}

export interface WorkSourceReaderDependencies {
  getWorkflowRun: typeof getWorkflowRun;
  getApprovalQueueItem: typeof getApprovalQueueItem;
  getMaintenanceTicket: typeof getMaintenanceTicket;
  getRenewalProgress: typeof getRenewalProgress;
  getRenewalLeaseVersion: (leaseId: string) => Promise<string | null>;
}

const defaultReaders: WorkSourceReaderDependencies = {
  getWorkflowRun,
  getApprovalQueueItem,
  getMaintenanceTicket,
  getRenewalProgress,
  getRenewalLeaseVersion: readLiveRenewalLeaseVersion,
};

/**
 * Resolve only the source identity, owning Space, and version needed by S68. The adapter deliberately
 * does not copy a workflow, lease, ticket, or Approval body into the accountability record.
 */
export class ExistingWorkSourceResolver implements WorkSourceResolver {
  constructor(
    private readonly db?: Firestore,
    private readonly readers: WorkSourceReaderDependencies = defaultReaders,
  ) {}

  async resolve(
    actor: AuthenticatedUser,
    input: { type: WorkSourceType; id?: string; space_id: string },
  ): Promise<WorkSourceResolution> {
    assertSpaceIdAccess(actor, input.space_id);
    if (input.type === "manual") {
      return { source: { type: "manual", status: "verified" }, space_id: input.space_id };
    }

    const id = normalizeOpaqueId(input.id, "Source id");
    try {
      if (input.type === "workflow_run") {
        const run = await this.readers.getWorkflowRun(actor, id, this.db);
        const spaceId =
          run.space_id ?? mappedSpaceIdForProcessDefinitionId(run.definition_id);
        return this.verified(actor, input, spaceId, run.updated_at);
      }

      if (input.type === "maintenance_ticket") {
        const ticket = await this.readers.getMaintenanceTicket(actor, id, this.db);
        return ticket
          ? this.verified(actor, input, ticket.space_id, ticket.updated_at)
          : { source: unverifiedSource(input.type, id) };
      }

      if (input.type === "approval_item") {
        const item = await this.readers.getApprovalQueueItem(actor, id, this.db);
        return this.verified(actor, input, item.space_id, item.updated_at);
      }

      const [progress, leaseVersion] = await Promise.all([
        this.readers.getRenewalProgress(actor, id, this.db),
        this.readers.getRenewalLeaseVersion(id),
      ]);
      if (!leaseVersion) return { source: unverifiedSource(input.type, id) };
      return this.verified(
        actor,
        input,
        "lease-renewals",
        `${leaseVersion}:progress:${progress ? `${progress.stageIndex}:${progress.complete ? "complete" : "open"}` : "untouched"}`,
      );
    } catch (error) {
      if (
        error instanceof AuthError ||
        (typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 403)
      ) {
        throw error;
      }
      return { source: unverifiedSource(input.type, id) };
    }
  }

  private verified(
    actor: AuthenticatedUser,
    input: { type: WorkSourceType; id?: string; space_id: string },
    resolvedSpaceId: string | undefined,
    version: string,
  ): WorkSourceResolution {
    const id = normalizeOpaqueId(input.id, "Source id");
    if (resolvedSpaceId) assertSpaceIdAccess(actor, resolvedSpaceId);
    if (!resolvedSpaceId || resolvedSpaceId !== input.space_id) {
      return { source: unverifiedSource(input.type, id) };
    }
    return {
      space_id: resolvedSpaceId,
      source: {
        type: input.type,
        id,
        link: canonicalSourceLink(input.type, id),
        version,
        status: "verified",
      },
    };
  }
}

async function readLiveRenewalLeaseVersion(leaseId: string): Promise<string | null> {
  const config = buildLiveRentVineConfig();
  if (!config.ok) return null;
  const now = Date.now();
  const { snapshot } = await getLiveLeaseSnapshot(config.rentvineClient, now);
  const exists = snapshot.views.some((view) => {
    for (const key of ["leaseID", "leaseId", "id"] as const) {
      const value = view[key];
      if (value !== undefined && value !== null && String(value).trim() === leaseId) {
        return true;
      }
    }
    return false;
  });
  if (!exists) {
    if (!snapshot.complete) {
      throw new Error(
        "The complete lease portfolio was not available for source verification.",
      );
    }
    return null;
  }
  return `rentvine:${new Date(snapshot.readAtMs).toISOString()}`;
}
