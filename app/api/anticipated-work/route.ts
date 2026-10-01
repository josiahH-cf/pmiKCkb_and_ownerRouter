import { NextResponse } from "next/server";
import { buildAnticipatedWork } from "@/lib/anticipation/projection";
import { apiErrorResponse } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, requireCapability } from "@/lib/auth/session";
import { listProcessDefinitions } from "@/lib/firestore/workflows";
import { loadLiveRenewalDesk } from "@/lib/lease-renewal/live-desk";
import { launchSpaces } from "@/lib/spaces";

// S147: Anticipated work moved from the Dashboard to Internal Processes (owner decision
// 2026-10-01). Internal Processes computes it only when someone asks, from the same read-only
// 120-day renewal desk and the default notice rules the Dashboard used, so opening the page never
// waits on the live renewal read. It returns value-free counts; Start run stays its own request.
export const dynamic = "force-dynamic";

const ANTICIPATION_WINDOW_DAYS = 120;

export async function GET() {
  try {
    const user = await requireCapability("read");
    if (!hasSpaceAccess(user, "renewals")) {
      return NextResponse.json(
        { error: "Anticipated work needs access to the Renewals Space." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    const now = new Date();
    const end = new Date(now.getTime() + ANTICIPATION_WINDOW_DAYS * 86_400_000);
    const [desk, definitions] = await Promise.all([
      loadLiveRenewalDesk(
        [
          {
            startIso: now.toISOString().slice(0, 10),
            endIso: end.toISOString().slice(0, 10),
          },
        ],
        now.toISOString(),
      ),
      listProcessDefinitions(user).catch(() => []),
    ]);
    // The same scoping the Dashboard applied: a Space-scoped user starts only visible processes.
    const visibleDefinitionIds = new Set(
      launchSpaces
        .filter(
          (space) =>
            space.showInDirectory !== false &&
            (user.scopes === undefined ||
              (space.scope !== undefined && hasSpaceAccess(user, space.scope))),
        )
        .flatMap((space) =>
          space.processDefinitionId ? [space.processDefinitionId] : [],
        ),
    );
    const startable = definitions
      .filter(
        (definition) =>
          definition.status !== "Retired" &&
          (user.scopes === undefined || visibleDefinitionIds.has(definition.id)),
      )
      .map((definition) => definition.id);
    const body =
      desk.status === "ok"
        ? {
            status: "ok" as const,
            groups: buildAnticipatedWork({
              referenceDateIso: now.toISOString().slice(0, 10),
              deskView: desk.view,
            }).groups,
          }
        : { status: "unavailable" as const, groups: [] };
    return NextResponse.json(
      {
        ...body,
        canStart: can(user.role, "edit"),
        startableDefinitionIds: startable,
        computedAtIso: now.toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
