// Always-visible Console action deck (console overhaul, Slice A). The three front-door areas —
// what needs a decision, which connections to set up, which spaces need coverage — rendered as
// clickable cards from state the ConsoleView already gathered server-side. Supersedes the
// click-to-reveal command buttons: the operator sees the work without a click.
//
// Value-free by construction: only a label, PII-free detail, and a deep link cross onto this
// surface (the same invariant the needs-decision inbox holds). The real values, reasons, and
// deciders live behind each row's href, on its gated surface.

import Link from "next/link";
import { StatusDot } from "@/components/ui";

export interface ConsoleDeckRow {
  label: string;
  detail?: string;
  href: string;
}

export interface ConsoleDeckCard {
  key: string;
  title: string;
  count: number;
  rows: readonly ConsoleDeckRow[];
  /** Shown when the count is zero, so an all-clear area reads as done, not empty. */
  emptyLabel: string;
  seeAllHref: string;
}

// Show a few rows inline; the rest are one click away behind "See all".
const PREVIEW_ROWS = 3;

export function ConsoleActionDeck({
  cards,
}: Readonly<{ cards: readonly ConsoleDeckCard[] }>) {
  return (
    <div
      aria-label="What needs your attention"
      className="grid three console-deck"
      role="group"
    >
      {cards.map((card) => {
        const preview = card.rows.slice(0, PREVIEW_ROWS);
        const status = card.count > 0 ? "action" : "connected";
        return (
          <section className="panel console-deck-card" data-status={status} key={card.key}>
            <div className="console-deck-head">
              <StatusDot status={status} />
              <h2>{card.title}</h2>
              <span className="console-deck-count">{card.count}</span>
            </div>
            {card.count === 0 ? (
              <p className="muted">{card.emptyLabel}</p>
            ) : (
              <>
                <ul className="console-deck-list">
                  {preview.map((row) => (
                    <li key={`${row.href}::${row.label}`}>
                      <Link href={row.href}>{row.label}</Link>
                      {row.detail ? (
                        <span className="muted console-deck-detail">{row.detail}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <Link className="text-link" href={card.seeAllHref}>
                  {card.count > preview.length ? `See all ${card.count}` : "Open"}
                </Link>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
