import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { ENTITY_TYPES, ENTITY_LABELS, entityOpenHref } from "@/lib/search/entity-types";
import { readSearchEntity } from "@/lib/search/server-search";
import { formatBusinessTimestamp } from "@/lib/date-display";
export const dynamic = "force-dynamic";
export default async function RelatedEntityPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const actor = await requirePageCapability("read"),
    q = await searchParams,
    type = z.enum(ENTITY_TYPES).safeParse(q.type),
    id = z
      .string()
      .regex(/^[A-Za-z0-9_:-]{1,160}$/)
      .safeParse(q.id),
    result =
      type.success && id.success
        ? await readSearchEntity(actor, type.data, id.data)
        : null,
    entity = result?.entity,
    related = entity
      ? result!.index.records.filter(
          (r) =>
            entity.relations.some((ref) => ref.type === r.type && ref.id === r.id) ||
            r.relations.some((ref) => ref.type === entity.type && ref.id === entity.id),
        )
      : [];
  return (
    <AppShell user={actor}>
      <main className="content content--workspace">
        <Link href="/search">← Entity search</Link>
        <h1>
          {entity
            ? `${ENTITY_LABELS[entity.type]}: ${entity.label}`
            : "Record unavailable"}
        </h1>
        {entity ? (
          <>
            <p>
              Reference {entity.id} · metadata read{" "}
              {entity.asOf ? formatBusinessTimestamp(entity.asOf) : "unavailable"}.
            </p>
            <h2>Current related records</h2>
            <p>
              Relationships use recorded source IDs. Missing associations remain unknown.
            </p>
            <ul>
              {related.map((r) => (
                <li key={`${r.type}:${r.id}`}>
                  <Link
                    href={entityOpenHref(r)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {ENTITY_LABELS[r.type]} · {r.label} · {r.id}
                  </Link>
                </li>
              ))}
            </ul>
            {!related.length ? (
              <p>No currently readable recorded associations are available.</p>
            ) : null}
          </>
        ) : (
          <p>
            The exact record is unavailable in the current accessible source. Search again
            for current records.
          </p>
        )}
        {result?.index.limitations.map((l) => (
          <p role="status" key={l.source}>
            {l.note}
          </p>
        ))}
      </main>
    </AppShell>
  );
}
