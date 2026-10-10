import { AppShell } from "@/components/layout/AppShell";
import { EntitySearchResults } from "@/components/search/EntitySearchResults";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { ENTITY_TYPES } from "@/lib/search/entity-types";
export const dynamic = "force-dynamic";
export default async function SearchPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const actor = await requirePageCapability("read"),
    q = (await searchParams) ?? {},
    query = typeof q.q === "string" && q.q.length <= 160 ? q.q : "",
    type =
      typeof q.type === "string" && (ENTITY_TYPES as readonly string[]).includes(q.type)
        ? q.type
        : "all";
  return (
    <AppShell user={actor}>
      <main className="content content--workspace">
        <EntitySearchResults initialQuery={query} initialType={type} />
      </main>
    </AppShell>
  );
}
