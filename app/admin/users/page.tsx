import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { UserManagementPanel } from "@/components/admin/UserManagementPanel";
import { type AppUser, listAppUsers } from "@/lib/admin/users";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { readServerConfig } from "@/lib/config/server";

// In-app user role + space-scope management (console overhaul Slice D + S16). Admin-only. Degrades to a clear note if
// the Admin SDK is unavailable in this session (matching the admin observability panel). The note
// gives staff their own next step; credential repair is engineering work, not a page instruction.
const ADMIN_USERS_UNAVAILABLE_NOTE =
  "The user roster could not be read in this session, so nobody is listed and nothing changed. Reload the page to try again, and report it with Feedback if it keeps happening.";

export default async function AdminUsersPage() {
  const user = await requirePageCapability("manageAdmin");
  const config = readServerConfig();

  let users: AppUser[] = [];
  let unavailableNote: string | undefined;
  try {
    users = await listAppUsers();
  } catch {
    unavailableNote = ADMIN_USERS_UNAVAILABLE_NOTE;
  }

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/admin">
          Back to Admin
        </Link>
        <h1 className="section-title">People and Access</h1>
        <p className="muted">
          {config.allowedHostedDomain} accounts start as Editors. App roles and Space
          access are separate from Google Workspace account creation.
        </p>
        <UserManagementPanel initialUsers={users} unavailableNote={unavailableNote} />
      </section>
    </AppShell>
  );
}
