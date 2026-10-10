import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { inspectOwnBusinessProfile } from "@/lib/firestore/presentation-settings";
export default async function Page() {
  const user = await requirePageCapability("read");
  let record: Awaited<ReturnType<typeof inspectOwnBusinessProfile>> | null = null;
  try {
    record = await inspectOwnBusinessProfile(user);
  } catch {
    /* Keep the profile's unavailable state explicit. */
  }
  return (
    <AppShell user={user}>
      <main className="content stack">
        <h1>My business profile</h1>
        <p>{user.email}</p>
        {record ? (
          <>
            <section className="card">
              <h2>Current approved business profile</h2>
              {record.profile ? (
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {Object.values(record.profile.profile).filter(Boolean).join("\n")}
                </p>
              ) : (
                <p>
                  No approved business profile is saved. Blank contact details remain
                  blank.
                </p>
              )}
            </section>
            <section className="card">
              <h2>Prior retained sender signature</h2>
              {record.retainedSignature ? (
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {[
                    record.retainedSignature.name,
                    record.retainedSignature.role,
                    record.retainedSignature.phone,
                    record.retainedSignature.hours,
                    record.retainedSignature.website?.url,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                </p>
              ) : (
                <p>No prior signature is recorded for your managed identity.</p>
              )}
            </section>
          </>
        ) : (
          <p>
            Profile history is unavailable right now. Previously saved messages keep their
            exact content.
          </p>
        )}
        {user.role === "Admin" ? (
          <Link href="/admin/presentation">Manage approved business profiles</Link>
        ) : (
          <p>Ask an Admin to update your approved business contact details.</p>
        )}
      </main>
    </AppShell>
  );
}
