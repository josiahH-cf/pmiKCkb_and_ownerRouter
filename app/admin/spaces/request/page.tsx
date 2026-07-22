import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { SpaceRequestPanel } from "@/components/admin/SpaceRequestPanel";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { listSpaceRequests, type SpaceRequest } from "@/lib/firestore/space-requests";

// Admin-only "request a new Space" page (Slice 7, D12). The app records the request and prints the exact
// provisioning commands for the owner to run. It never provisions Vertex (that would bill).
export default async function AdminSpaceRequestPage() {
  const user = await requirePageCapability("manageAdmin");

  let requests: SpaceRequest[] = [];
  let unavailableNote: string | undefined;
  try {
    requests = await listSpaceRequests(user);
  } catch {
    unavailableNote =
      "Prior requests are unavailable in this session. Refresh Google credentials (npm run auth:session) or check the Firebase Admin setup, then reload.";
  }

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/admin">
          Back to Admin
        </Link>
        <h1 className="section-title">Request a new Space</h1>
        <p className="muted">
          Describe the Space you want and the app prints the exact commands to provision it. The app
          records the request only; you run the commands. Nothing is provisioned automatically.
        </p>
        {unavailableNote ? <p className="muted">{unavailableNote}</p> : null}
        <SpaceRequestPanel initialRequests={requests} />
      </section>
    </AppShell>
  );
}
