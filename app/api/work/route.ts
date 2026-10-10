import { NextResponse } from "next/server";
import { EditableLayerError } from "@/lib/firestore/errors";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { WorkAccountabilityStore } from "@/lib/firestore/work-accountability";
import { listWorkAssignableUsers } from "@/lib/work-accountability/roster";
import { WorkMutationSchema } from "@/lib/work-accountability/schemas";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability("read");
    const query = new URL(request.url).searchParams;
    const leaseId = query.get("lease_id");
    if (leaseId !== null) {
      const intent = query.get("creation_intent"),
        taskId = query.get("task_id");
      const allowed =
        intent !== null
          ? ["lease_id", "creation_intent"]
          : taskId !== null
            ? ["lease_id", "task_id", "activity_after"]
            : ["lease_id", "after"];
      if (
        [...query.keys()].some(
          (key) => !allowed.includes(key) || query.getAll(key).length !== 1,
        )
      )
        throw new EditableLayerError(
          "Choose one lease task read and its supported cursor.",
          400,
        );
      const store = new WorkAccountabilityStore();
      if (intent !== null)
        return NextResponse.json(
          await store.leaseFollowUpCreationReceipt(actor, leaseId, intent),
        );
      if (taskId !== null)
        return NextResponse.json(
          await store.leaseFollowUpActivity(
            actor,
            leaseId,
            taskId,
            query.get("activity_after") ?? undefined,
          ),
        );
      const snapshot = await store.listLeaseFollowUps(
        actor,
        leaseId,
        query.get("after") ?? undefined,
      );
      let context = null,
        contextError = "";
      try {
        context = await store.leaseFollowUpContext(actor, leaseId);
      } catch (e) {
        contextError =
          e instanceof Error ? e.message : "The current cycle could not be read.";
      }
      const roster = actor.role === "Admin" ? await listWorkAssignableUsers() : undefined;
      return NextResponse.json(
        { snapshot, context, contextError, ...(roster ? { roster } : {}) },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const view =
      new URL(request.url).searchParams.get("view") === "team" ? "team" : "mine";
    const store = new WorkAccountabilityStore();
    const snapshot = await store.listSnapshot(actor, view);
    const roster = view === "team" ? await listWorkAssignableUsers() : undefined;
    return NextResponse.json({ snapshot, ...(roster ? { roster } : {}) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability("edit");
    assertMutationAllowed(requireEnvironmentDescriptor());
    const input = await parseJsonBody(request, WorkMutationSchema);
    const store = new WorkAccountabilityStore();

    switch (input.action) {
      case "create_lease_follow_up":
        return NextResponse.json(await store.createLeaseFollowUp(actor, input));
      case "create_task":
        return NextResponse.json({ task: await store.createTask(actor, input) });
      case "derive_task":
        return NextResponse.json({ task: await store.deriveTask(actor, input) });
      case "start_session":
        return NextResponse.json({ session: await store.startSession(actor, input) });
      case "heartbeat":
        return NextResponse.json({ session: await store.heartbeat(actor, input) });
      case "reconcile":
        return NextResponse.json({
          session: await store.reconcileOwnSession(actor),
        });
      case "reconcile_team":
        return NextResponse.json({
          reconciliation: await store.reconcileTeamSessions(actor, input.limit),
        });
      case "transition_task":
        return NextResponse.json({ task: await store.transitionTask(actor, input) });
      case "reassign_task":
        return NextResponse.json({ task: await store.reassignTask(actor, input) });
      case "correct_session":
        return NextResponse.json({ session: await store.correctSession(actor, input) });
      case "create_expectation":
        return NextResponse.json({
          expectation: await store.createExpectation(actor, input),
        });
      case "rebase_expectation":
        return NextResponse.json({
          task: await store.rebaseTaskExpectation(actor, input),
        });
      case "create_mapping":
        return NextResponse.json({ mapping: await store.createMapping(actor, input) });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
