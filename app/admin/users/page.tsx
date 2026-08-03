import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { UserManagementPanel } from "@/components/admin/UserManagementPanel";
import { type AppUser, listAppUsers } from "@/lib/admin/users";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";

// In-app user role + space-scope management (console overhaul Slice D + S16). Admin-only. Degrades to a clear note if
// the Admin SDK is unavailable in this session (matching the admin observability panel).
export default async function AdminUsersPage() {
  const user = await requirePageCapability("manageAdmin");
  const config = readServerConfig();

  let users: AppUser[] = [];
  let unavailableNote: string | undefined;
  try {
    users = await listAppUsers();
  } catch {
    unavailableNote =
      "The user roster is unavailable in this session. Refresh Google credentials (npm run auth:session) or check the Firebase Admin setup, then reload.";
  }

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/admin">
          Back to Admin
        </Link>
        <h1 className="section-title">People and Access</h1>
        <p className="muted">
          Anyone who signs in with a {config.allowedHostedDomain} Google account starts as
          an Editor. Promote a teammate to Approver or Admin here. Account creation stays
          in Google Workspace; this manages roles and space access.
        </p>
        <UserManagementPanel initialUsers={users} unavailableNote={unavailableNote} />
      </section>
    </AppShell>
  );
}
