import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { ENTITY_TYPES } from "@/lib/search/entity-types";
import { readSearchEntity } from "@/lib/search/server-search";
export const dynamic = "force-dynamic";
export default async function OpenSearchEntity({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const actor = await requirePageCapability("read"),
    q = await searchParams,
    type = z.enum(ENTITY_TYPES).safeParse(q.type),
    id = z
      .string()
      .regex(/^[A-Za-z0-9_:-]{1,160}$/)
      .safeParse(q.id);
  if (type.success && id.success) {
    const result = await readSearchEntity(actor, type.data, id.data);
    if (result.entity) redirect(result.entity.href);
  }
  return (
    <AppShell user={actor}>
      <main className="content">
        <h1>Record unavailable</h1>
        <p>
          This exact record is unavailable in the current accessible source. Search again
          to read current matches.
        </p>
        <Link href="/search">Return to search</Link>
      </main>
    </AppShell>
  );
}
