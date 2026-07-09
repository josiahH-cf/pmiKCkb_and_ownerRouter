// Console process strip (console overhaul, Slice A). A compact, read-only front door to the live
// processes-of-record and their state, so the Console reflects what is happening rather than being
// only an ask box. The state comes from the same computeSpaceCardState the Spaces directory uses;
// each chip deep-links to that process's desk. Read-only — no action happens here.

import Link from "next/link";
import { StatusDot, type ConnectionStatus } from "@/components/ui";

export interface ConsoleProcessItem {
  id: string;
  name: string;
  category: string;
  stateLabel: string;
  status: ConnectionStatus;
  href: string;
}

export function ConsoleProcessStrip({
  items,
}: Readonly<{ items: readonly ConsoleProcessItem[] }>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-label="Processes" className="console-process-strip">
      <h2 className="console-strip-title">Processes</h2>
      <div className="grid three">
        {items.map((item) => (
          <Link className="panel console-process-chip" href={item.href} key={item.id}>
            <span className="console-process-name">{item.name}</span>
            <span className="muted">{item.category}</span>
            <StatusDot label={item.stateLabel} status={item.status} />
          </Link>
        ))}
      </div>
    </section>
  );
}
