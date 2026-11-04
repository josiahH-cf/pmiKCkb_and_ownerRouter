"use client";

// S242 R-S242-2: the help table of contents. Sections open and close with a disclosure button
// that is keyboard reachable and announced; the section holding the current page is open on
// arrival; open or closed state lasts for this browser session only. On narrow screens the whole
// list becomes one disclosure above the page content. Navigating help records nothing.

import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";

export interface HelpTocLink {
  readonly href: string;
  readonly title: string;
  readonly admin?: boolean;
}

export interface HelpTocGroup {
  readonly id: string;
  readonly title: string;
  readonly links: readonly HelpTocLink[];
}

const STORAGE_KEY = "pmi-help-toc-open";
const CHANGE_EVENT = "pmi-help-toc-open-change";

// The sections opened earlier in this browser session, read as an external store so the server
// render and hydration use the same closed state and the saved state applies right after.
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function storedSnapshot(): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function serverSnapshot(): string {
  return "";
}

function storedGroups(text: string): readonly string[] {
  try {
    const saved: unknown = JSON.parse(text || "[]");
    return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function HelpTableOfContents({
  groups,
  leading = [],
  trailing,
  currentHref,
  currentGroup,
}: Readonly<{
  groups: readonly HelpTocGroup[];
  leading?: readonly HelpTocLink[];
  trailing: readonly HelpTocLink[];
  currentHref: string;
  currentGroup?: string;
}>) {
  const listId = useId();
  const stored = useSyncExternalStore(subscribe, storedSnapshot, serverSnapshot);
  // Changes made on this page view; before the first one, the open sections are those opened
  // earlier in this session plus the section holding the current page.
  const [changed, setChanged] = useState<ReadonlySet<string> | null>(null);
  const open: ReadonlySet<string> =
    changed ??
    new Set([...storedGroups(stored), ...(currentGroup ? [currentGroup] : [])]);
  const [narrowOpen, setNarrowOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  function toggle(group: HelpTocGroup) {
    const next = new Set(open);
    const opening = !next.has(group.id);
    if (opening) next.add(group.id);
    else next.delete(group.id);
    setChanged(next);
    setAnnouncement(`${group.title} ${opening ? "expanded" : "collapsed"}`);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // Session storage is optional; the list still works without it.
    }
  }

  return (
    <div className="help-toc" data-narrow-open={narrowOpen ? "true" : "false"}>
      <button
        aria-controls={listId}
        aria-expanded={narrowOpen}
        className="help-toc-narrow-toggle"
        onClick={() => setNarrowOpen((value) => !value)}
        type="button"
      >
        Help contents
      </button>
      <nav aria-label="Help contents" className="help-toc-panel" id={listId}>
        <ul className="help-toc-groups">
          {leading.map((link) => (
            <li className="help-toc-group help-toc-single" key={link.href}>
              <TocLink currentHref={currentHref} link={link} />
            </li>
          ))}
          {groups.map((group) => {
            const expanded = open.has(group.id);
            const panelId = `${listId}-${group.id}`;
            return (
              <li className="help-toc-group" key={group.id}>
                <button
                  aria-controls={panelId}
                  aria-expanded={expanded}
                  className="help-toc-group-toggle"
                  data-current={group.id === currentGroup ? "true" : undefined}
                  onClick={() => toggle(group)}
                  type="button"
                >
                  <span aria-hidden="true" className="help-toc-chevron" />
                  {group.title}
                </button>
                <ul className="help-toc-links" hidden={!expanded} id={panelId}>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <TocLink currentHref={currentHref} link={link} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
          {trailing.map((link) => (
            <li className="help-toc-group help-toc-single" key={link.href}>
              <TocLink currentHref={currentHref} link={link} />
            </li>
          ))}
        </ul>
      </nav>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

function TocLink({
  link,
  currentHref,
}: Readonly<{ link: HelpTocLink; currentHref: string }>) {
  const current = link.href === currentHref;
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className="help-toc-link"
      href={link.href}
      prefetch={false}
    >
      {link.title}
      {link.admin ? <span className="help-admin-label">Admin</span> : null}
    </Link>
  );
}
