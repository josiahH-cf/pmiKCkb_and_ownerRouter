import Link from "next/link";
import { PmiWordmark } from "@/components/brand/PmiWordmark";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { EnvironmentBadge } from "@/components/layout/EnvironmentBadge";
import { NotificationMenu } from "@/components/layout/NotificationMenu";
import { Appearance } from "@/components/layout/Appearance";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ReportIssueButton } from "@/components/feedback/ReportIssueButton";
import { SessionTimeout } from "@/components/layout/SessionTimeout";
import {
  allowsMutation,
  resolveEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { PMI_WORDMARK, PRODUCT_NAME } from "@/lib/constants";
import {
  resolvePrimaryNavigation,
  type PrimaryNavigationProjection,
} from "@/lib/navigation/primary-navigation";
import { readPrimaryNavigationProjection } from "@/lib/navigation/primary-navigation-projection";

export async function AppShell({
  children,
  user,
  navigationProjection,
}: Readonly<{
  children: React.ReactNode;
  user: AuthenticatedUser;
  navigationProjection?: PrimaryNavigationProjection;
}>) {
  const environment = resolveEnvironmentDescriptor();
  const mutationControlsVisible =
    environment.ok && allowsMutation(environment.descriptor);
  const resolvedNavigationProjection =
    navigationProjection ?? (await readPrimaryNavigationProjection(user));
  const navigationGroups = resolvePrimaryNavigation(user, resolvedNavigationProjection);

  return (
    <div className="page">
      <header className="topbar">
        <Link className="brand" href="/" aria-label={`${PMI_WORDMARK} · ${PRODUCT_NAME}`}>
          <PmiWordmark variant="inline" />
        </Link>
        {/* Sits beside the wordmark, before the nav, so it cannot collide with the nav's own
            wrapping at narrow widths. Renders nothing at all in ordinary live Production. */}
        <EnvironmentBadge descriptor={environment} />
        <nav className="primary-navigation" aria-label="Primary">
          <PrimaryNav groups={navigationGroups} />
        </nav>
        <NotificationMenu />
        <Appearance />
        <span className="user-role">{user.role}</span>
        <SignOutButton />
      </header>
      {children}
      {/* TIX-1/2: persistent global "Report an issue" affordance on every signed-in page. */}
      {mutationControlsVisible ? <ReportIssueButton /> : null}
      {/* NOTIF-6: idle session timeout with a 28-min warning + 2-min countdown + auto sign-out. */}
      <SessionTimeout />
    </div>
  );
}
