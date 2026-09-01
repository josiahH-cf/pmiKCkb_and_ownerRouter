import { AccessCenter, type AccessPreselection } from "@/components/admin/AccessCenter";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { can, type Capability } from "@/lib/auth/roles";
import {
  capabilityCatalogEntry,
  isAccessCapability,
  isAccessSpace,
} from "@/lib/access/catalog";
import { hasDifferentEligibleAdmin } from "@/lib/access/directory";
import { validateAccessReturnTarget } from "@/lib/access/handoff";
import {
  buildAccessEffectiveProjection,
  readDirectorySyncState,
} from "@/lib/access/projection";
import { listOwnAccessRequests } from "@/lib/access/request-service";
import { requirePageCapability } from "@/lib/auth/page-guards";

type SearchValue = string | string[] | undefined;

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchValue>>;
}) {
  const user = await requirePageCapability("read");
  const rawSearch = (await searchParams) ?? {};
  const preselectionResult = readPreselection(rawSearch, user.role, user.scopes);
  const directorySyncState = await readDirectorySyncState(user);
  const projection = buildAccessEffectiveProjection(user, directorySyncState);

  let history: Awaited<ReturnType<typeof listOwnAccessRequests>> | null = null;
  let historyUnavailable = false;
  try {
    history = await listOwnAccessRequests(user, { limit: 50 });
  } catch {
    historyUnavailable = true;
  }

  let reviewerAvailable: boolean | null = null;
  try {
    reviewerAvailable = await hasDifferentEligibleAdmin(user.uid);
  } catch {
    reviewerAvailable = null;
  }

  return (
    <AppShell user={user}>
      <main className="content ui-stack">
        <PageHeader
          subtitle="Understand current session access, request an additive role or Space bundle, track the durable result, and find connection status."
          title="Understand and request my access"
        />
        <AccessCenter
          currentScopes={user.scopes}
          historyUnavailable={historyUnavailable}
          initialHistory={history}
          isAdmin={can(user.role, "manageAdmin")}
          preselection={preselectionResult.preselection}
          preselectionNotice={preselectionResult.notice}
          projection={projection}
          reviewerAvailable={reviewerAvailable}
        />
      </main>
    </AppShell>
  );
}

function readPreselection(
  raw: Record<string, SearchValue>,
  role: "Editor" | "Approver" | "Admin",
  scopes: readonly ("renewals" | "maintenance")[] | undefined,
): { preselection?: AccessPreselection; notice?: string } {
  const keys = Object.keys(raw);
  if (keys.length === 0) return {};
  const allowed = new Set(["v", "capability", "space", "return_to"]);
  if (
    keys.some((key) => !allowed.has(key)) ||
    keys.some((key) => Array.isArray(raw[key])) ||
    raw.v !== "1" ||
    typeof raw.capability !== "string" ||
    !isAccessCapability(raw.capability)
  ) {
    return { notice: "Requested access option is unavailable." };
  }
  const capability = raw.capability as Capability;
  let space: "renewals" | "maintenance" | undefined;
  if (raw.space !== undefined) {
    if (
      typeof raw.space !== "string" ||
      !isAccessSpace(raw.space) ||
      !capabilityCatalogEntry(capability).namedSpaceRequestable
    ) {
      return { notice: "Requested access option is unavailable." };
    }
    space = raw.space;
  }
  if (
    can(role, capability) &&
    (!space || scopes === undefined || scopes.includes(space))
  ) {
    return { notice: "Requested access option is unavailable." };
  }
  let returnTo: string | undefined;
  if (raw.return_to !== undefined) {
    if (typeof raw.return_to !== "string") {
      return { notice: "Requested access option is unavailable." };
    }
    try {
      returnTo = validateAccessReturnTarget(raw.return_to);
    } catch {
      return { notice: "Requested access option is unavailable." };
    }
  }
  return { preselection: { capability, space, returnTo } };
}
