import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { listAppUsers, type AppUser } from "@/lib/admin/users";
import { StaffBusinessProfiles } from "@/components/admin/StaffBusinessProfiles";
import { PresentationSettingsPanel } from "@/components/admin/PresentationSettingsPanel";
export default async function Page() {
  const user = await requirePageCapability("manageAdmin");
  let users: AppUser[] = [];
  try {
    users = await listAppUsers();
  } catch {
    /* The profile selector stays unavailable; display-name controls remain independent. */
  }
  return (
    <AppShell user={user}>
      <main className="content stack">
        <Link href="/admin">Back to Admin</Link>
        <h1>Business profiles and application name</h1>
        <StaffBusinessProfiles users={users} />
        <PresentationSettingsPanel kind="display" />
      </main>
    </AppShell>
  );
}
