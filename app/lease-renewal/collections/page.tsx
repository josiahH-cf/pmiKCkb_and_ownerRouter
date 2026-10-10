import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { SharedLeaseCollections } from "@/components/lease-renewal/SharedLeaseCollections";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { CollectionLeaseIdSchema } from "@/lib/lease-renewal/shared-collections";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function SharedLeaseCollectionsPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability(renewalRoleCapability("read_workspace")),
    q = (await searchParams) ?? {};
  const scalar = (key: string) => (typeof q[key] === "string" ? (q[key] as string) : "");
  const uuid = (key: string) =>
    z.string().uuid().safeParse(scalar(key)).success ? scalar(key) : null;
  const members = scalar("members").split(",").filter(Boolean);
  const valid =
    members.length <= 2000 &&
    members.every((id) => CollectionLeaseIdSchema.safeParse(id).success);
  return (
    <AppShell user={user}>
      <main className="content content--workspace">
        <Link href="/lease-renewal/live/desk">← Renewal worklist</Link>
        {!valid ? (
          <p role="alert">
            The incoming lease selection is invalid. Choose actual accessible leases for
            review.
          </p>
        ) : null}
        <SharedLeaseCollections
          ownerUid={user.uid}
          initialMembers={valid ? members : []}
          origin={
            scalar("origin") === "assistant"
              ? "assistant"
              : scalar("origin") === "worklist"
                ? "worklist"
                : "explicit"
          }
          initialCriteria={scalar("criteria").length <= 4096 ? scalar("criteria") : ""}
          initialId={uuid("id")}
          initialReview={uuid("review")}
          initialOperation={uuid("operation")}
        />
      </main>
    </AppShell>
  );
}
