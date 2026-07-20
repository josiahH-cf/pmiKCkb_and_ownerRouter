"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// FTU-2/FTU-8: the primary nav renders each link with an active state so a user always knows where
// they are, and treats the home route "/" and "/ask" as the same Console surface (both render the
// ConsoleView). Client component only because it reads the current pathname; when there is no router
// context (e.g. a bare unit render) usePathname returns null and nothing is marked active.
export interface PrimaryNavItem {
  readonly href: string;
  readonly label: string;
  /** Extra pathnames that also mark this item active (e.g. "/" for the Console at "/ask"). */
  readonly alsoActiveOn?: readonly string[];
}

function isActive(pathname: string | null, item: PrimaryNavItem): boolean {
  if (!pathname) {
    return false;
  }
  if (pathname === item.href || item.alsoActiveOn?.includes(pathname)) {
    return true;
  }
  // A sub-route marks its parent active (e.g. /lease-renewal/live -> "Lease Renewal"), but "/" never
  // matches everything.
  return item.href !== "/" && pathname.startsWith(`${item.href}/`);
}

export function PrimaryNav({ items }: Readonly<{ items: readonly PrimaryNavItem[] }>) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "active" : undefined}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
