import { NextResponse } from "next/server";
import { isQueueAudienceGroup, isQueueRisk, isQueueStatus } from "@/lib/approval/queue";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  listApprovalQueue,
  type ListApprovalQueueOptions,
} from "@/lib/firestore/approval-queue";

export async function GET(request: Request) {
  try {
    const user = await requireCapability("read");
    const options = parseListOptions(new URL(request.url).searchParams);
    const items = await listApprovalQueue(user, options);

    return NextResponse.json({ items });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function parseListOptions(searchParams: URLSearchParams): ListApprovalQueueOptions {
  const filters: NonNullable<ListApprovalQueueOptions["filters"]> = {};
  const processRunId = optionalParam(searchParams, "process_run_id");
  const assigneeUid = optionalParam(searchParams, "assignee_uid");
  const requiredApproverUid = optionalParam(searchParams, "required_approver_uid");
  const dueDate = optionalParam(searchParams, "due_date");
  const risk = optionalParam(searchParams, "risk");
  const status = optionalParam(searchParams, "status");
  const audienceGroup = optionalParam(searchParams, "audience_group");

  if (processRunId) {
    filters.process_run_id = processRunId;
  }

  if (assigneeUid) {
    filters.assignee_uid = assigneeUid;
  }

  if (requiredApproverUid) {
    filters.required_approver_uid = requiredApproverUid;
  }

  if (dueDate) {
    assertIsoDate(dueDate, "due_date");
    filters.due_date = dueDate;
  }

  if (risk) {
    if (!isQueueRisk(risk)) {
      throw new EditableLayerError("Invalid approval queue risk filter.", 400);
    }
    filters.risk = risk;
  }

  if (status) {
    if (!isQueueStatus(status)) {
      throw new EditableLayerError("Invalid approval queue status filter.", 400);
    }
    filters.status = status;
  }

  if (audienceGroup) {
    if (!isQueueAudienceGroup(audienceGroup)) {
      throw new EditableLayerError("Invalid approval queue audience filter.", 400);
    }
    filters.audience_group = audienceGroup;
  }

  return Object.keys(filters).length > 0 ? { filters } : {};
}

function optionalParam(searchParams: URLSearchParams, name: string) {
  const value = searchParams.get(name)?.trim();
  return value ? value : undefined;
}

function assertIsoDate(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new EditableLayerError(`Invalid ${name} filter. Expected YYYY-MM-DD.`, 400);
  }
}
