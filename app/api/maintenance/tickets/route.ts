import { verifyMaintenanceCreationUnit } from "@/lib/maintenance/verified-ticket-property";
import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  CreateLiveMaintenanceTicketInputSchema,
  createMaintenanceTicket,
  listMaintenanceTickets,
  readMaintenanceTicketCreation,
} from "@/lib/firestore/maintenance-tickets";

// GET /api/maintenance/tickets — the current staff ticket queue and actor-private creation receipt. POST — create a ticket from the
// captured work-order draft. App-plane only; the RentVine work-order create stays gated.
export async function GET(request?: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "maintenance");
    const params = request ? new URL(request.url).searchParams : new URLSearchParams();
    if (params.has("creation_id")) {
      if (
        [...params.keys()].some((k) => k !== "creation_id") ||
        params.getAll("creation_id").length !== 1 ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          params.get("creation_id") ?? "",
        )
      )
        return NextResponse.json(
          { error: "Invalid creation result identity." },
          { status: 400 },
        );
      return NextResponse.json(
        await readMaintenanceTicketCreation(user, params.get("creation_id")!),
        { headers: { "cache-control": "private, no-store" } },
      );
    }
    const rawMode = request ? new URL(request.url).searchParams.get("data_mode") : null;
    if (rawMode && rawMode !== "live") {
      return NextResponse.json(
        { error: "The Production maintenance queue is Live-only." },
        { status: 400 },
      );
    }
    const tickets = await listMaintenanceTickets(user);
    return NextResponse.json({ tickets });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let stage: "admission" | "recovery" | "validation" | "commit" = "admission";
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const input = await parseJsonBody(request, CreateLiveMaintenanceTicketInputSchema);
    stage = "recovery";
    const original = await readMaintenanceTicketCreation(user, input.creation_id, input);
    if (original.state === "created")
      return NextResponse.json(
        { ticket: original.ticket, creation: original },
        { headers: { "cache-control": "private, no-store" } },
      );
    if (original.state === "unresolved")
      return NextResponse.json(
        { error: original.detail, creation: original },
        { status: 409 },
      );
    stage = "validation";
    const propertyId = await verifyMaintenanceCreationUnit(input.unit);
    stage = "commit";
    const ticket = await createMaintenanceTicket(user, input, undefined, propertyId);
    return NextResponse.json(
      { ticket, creation: { state: "created", creation_id: input.creation_id, ticket } },
      { status: 201, headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    const response = apiErrorResponse(error),
      body = await response.json();
    return NextResponse.json(
      {
        ...body,
        request_commit_state:
          stage === "admission" || stage === "validation" ? "not_started" : "unresolved",
      },
      { status: response.status, headers: { "cache-control": "private, no-store" } },
    );
  }
}
