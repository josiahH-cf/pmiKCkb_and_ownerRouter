import Link from "next/link";
import { PmiWordmark } from "@/components/brand/PmiWordmark";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { NotificationMenu } from "@/components/layout/NotificationMenu";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { PRODUCT_NAME } from "@/lib/constants";

const navItems = [
  { href: "/ask", label: "Ask" },
  { href: "/spaces", label: "Spaces" },
  { href: "/processes", label: "Processes" },
  { href: "/approval-queue", label: "Approval Queue" },
  { href: "/lease-renewal/runs", label: "Lease Renewal" },
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
          href="/ask"
          aria-label={PRODUCT_NAME}
          title={PRODUCT_NAME}
        >
          <PmiWordmark variant="inline" />
        </Link>
        <nav className="nav" aria-label="Primary">
          {navItems.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
          {can(user.role, "manageAdmin") ? <Link href="/admin">Admin</Link> : null}
          <NotificationMenu />
          <span className="user-role">{user.role}</span>
          <SignOutButton />
        </nav>
      </header>
      {children}
    </div>
  );
}
