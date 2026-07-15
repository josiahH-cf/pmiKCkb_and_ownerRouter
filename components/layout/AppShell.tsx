import Link from "next/link";
import { PmiWordmark } from "@/components/brand/PmiWordmark";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { NotificationMenu } from "@/components/layout/NotificationMenu";
import { ReleaseStageBanner } from "@/components/layout/ReleaseStageBanner";
import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { PMI_WORDMARK, PRODUCT_NAME, type SpaceScope } from "@/lib/constants";

// Processes is no longer a standalone nav tab (A-IA-V2): each process is surfaced alongside its Space
// (Spaces ⊇ Processes). The /processes routes + the process-definition engine are preserved and still
// deep-linked (e.g. from the Renewal Desk and each Space's Process sub-tab).
const navItems: readonly { href: string; label: string; scope?: SpaceScope }[] = [
  { href: "/ask", label: "Console" },
  { href: "/spaces", label: "Spaces" },
  { href: "/approval-queue", label: "Approval Queue", scope: "renewals" },
  { href: "/gmail-hub", label: "Communications" },
];

export function AppShell({
  children,
  user,
}: Readonly<{ children: React.ReactNode; user: AuthenticatedUser }>) {
  return (
    <div className="page">
      <header className="topbar">
        <Link
          className="brand"
          href="/"
          aria-label={`${PMI_WORDMARK} · ${PRODUCT_NAME}`}
          title={`${PMI_WORDMARK} · ${PRODUCT_NAME}`}
        >
          <PmiWordmark variant="inline" />
        </Link>
        <nav className="nav" aria-label="Primary">
          {navItems
            .filter(
              (item) => item.scope === undefined || hasSpaceAccess(user, item.scope),
            )
            .map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          {/* Every role sees connection status read-only (S13 D5); Admins manage from the same page. */}
          <Link href="/connections">Connections</Link>
          {can(user.role, "manageAdmin") ? <Link href="/admin">Admin</Link> : null}
          <NotificationMenu />
          <span className="user-role">{user.role}</span>
          <SignOutButton />
        </nav>
      </header>
      <ReleaseStageBanner />
      {children}
    </div>
  );
}
