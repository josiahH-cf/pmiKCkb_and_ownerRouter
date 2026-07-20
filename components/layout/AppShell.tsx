import Link from "next/link";
import { PmiWordmark } from "@/components/brand/PmiWordmark";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { NotificationMenu } from "@/components/layout/NotificationMenu";
import { PrimaryNav, type PrimaryNavItem } from "@/components/layout/PrimaryNav";
import { ReleaseStageBanner } from "@/components/layout/ReleaseStageBanner";
import { ReportIssueButton } from "@/components/feedback/ReportIssueButton";
import { SessionTimeout } from "@/components/layout/SessionTimeout";
import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { PMI_WORDMARK, PRODUCT_NAME, type SpaceScope } from "@/lib/constants";

// Processes is no longer a standalone nav tab (A-IA-V2): each process is surfaced alongside its Space
// (Spaces ⊇ Processes). The /processes routes + the process-definition engine are preserved and still
// deep-linked (e.g. from the Renewal Desk and each Space's Process sub-tab).
//
// FTU-7: the built operator desks (Lease Renewal, Maintenance) are surfaced directly in the nav,
// scope-filtered, so a single-scope user reaches their daily work in one click instead of via Spaces.
// FTU-8: the Console entry also reads active on the home route "/" (both render the ConsoleView).
const navItems: readonly (PrimaryNavItem & { scope?: SpaceScope })[] = [
  { href: "/ask", label: "Console", alsoActiveOn: ["/"] },
  { href: "/spaces", label: "Spaces" },
  { href: "/lease-renewal", label: "Lease Renewal", scope: "renewals" },
  { href: "/maintenance", label: "Maintenance", scope: "maintenance" },
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
          <PrimaryNav
            items={[
              ...navItems.filter(
                (item) => item.scope === undefined || hasSpaceAccess(user, item.scope),
              ),
              // Every role sees connection status read-only (S13 D5); Admins manage from the same page.
              { href: "/connections", label: "Connections" },
              ...(can(user.role, "manageAdmin")
                ? [{ href: "/admin", label: "Admin" }]
                : []),
            ]}
          />
          <NotificationMenu />
          <span className="user-role">{user.role}</span>
          <SignOutButton />
        </nav>
      </header>
      <ReleaseStageBanner />
      {children}
      {/* TIX-1/2: persistent global "Report an issue" affordance on every signed-in page. */}
      <ReportIssueButton />
      {/* NOTIF-6: idle session timeout with a 28-min warning + 2-min countdown + auto sign-out. */}
      <SessionTimeout />
    </div>
  );
}
