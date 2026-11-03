"use client";

import type { MoveOutTimingBasisAdminRead } from "@/lib/firestore/lease-renewal-move-out-timing-basis";
import { NoticeTimingBasisSelection } from "@/components/lease-renewal/NoticeTimingBasisSelection";

/** Admin and ordinary renewal staff share the same selection/store contract. */
export function MoveOutTimingBasisAdminPanel({
  initial,
  note,
  canEdit = true,
}: Readonly<{
  initial: MoveOutTimingBasisAdminRead;
  note?: string;
  canEdit?: boolean;
}>) {
  return (
    <article className="panel ui-stack" data-move-out-timing-basis-state={initial.state}>
      <h2>Notice Timing Basis</h2>
      {note ? <p className="muted">{note}</p> : null}
      <NoticeTimingBasisSelection initial={initial} canEdit={canEdit} />
    </article>
  );
}
