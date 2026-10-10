import { Suspense } from "react";
import Link from "next/link";
import { GlobalEntitySearch } from "@/components/search/GlobalEntitySearch";
import { PmiWordmark } from "@/components/brand/PmiWordmark";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { EnvironmentBadge } from "@/components/layout/EnvironmentBadge";
import { NotificationMenu } from "@/components/layout/NotificationMenu";
import { Appearance } from "@/components/layout/Appearance";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ReportIssueButton } from "@/components/feedback/ReportIssueButton";
import { SessionTimeout } from "@/components/layout/SessionTimeout";
import { PersonalViewProvider } from "@/components/layout/PersonalViewProvider";
import { NavigationFeedback } from "@/components/layout/NavigationFeedback";
import { deskPreferenceModeFor } from "@/lib/firestore/renewal-desk-preferences";
import {
  allowsMutation,
  resolveEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readApplicationDisplayName } from "@/lib/firestore/presentation-settings";
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
  const displayName = await readApplicationDisplayName();
  const environment = resolveEnvironmentDescriptor();
  const mutationControlsVisible =
    environment.ok && allowsMutation(environment.descriptor);
  const resolvedNavigationProjection =
    navigationProjection ?? (await readPrimaryNavigationProjection(user));
  const navigationGroups = resolvePrimaryNavigation(user, resolvedNavigationProjection);

  return (
    <PersonalViewProvider
      accountId={user.uid}
      canSave={deskPreferenceModeFor(user) === "saved"}
      key={`${user.uid}:${user.role}`}
    >
      <div className="page">
        <header className="topbar">
          <Link
            className="brand"
            href="/"
            aria-label={`${PMI_WORDMARK} · ${displayName}`}
          >
            <PmiWordmark variant="inline" />
            {displayName !== PRODUCT_NAME ? (
              <span className="application-display-name">{displayName}</span>
            ) : null}
          </Link>
          <GlobalEntitySearch key={user.uid} />
          {/* Sits beside the wordmark, before the nav, so it cannot collide with the nav's own
            wrapping at narrow widths. Renders nothing at all in ordinary live Production. */}
          <EnvironmentBadge descriptor={environment} />
          <nav className="primary-navigation" aria-label="Primary">
            <PrimaryNav groups={navigationGroups} />
          </nav>
          <NotificationMenu />
          <Appearance />
          {mutationControlsVisible ? <ReportIssueButton /> : null}
          <Link href="/profile" className="user-role" aria-label="My business profile">
            {user.role}
          </Link>
          <SignOutButton />
        </header>
        <Suspense fallback={null}>
          <NavigationFeedback />
        </Suspense>
        {children}
        {/* TIX-1/2: persistent global "Report an issue" affordance on every signed-in page. */}
        {/* NOTIF-6: idle session timeout with a 28-min warning + 2-min countdown + auto sign-out. */}
        <SessionTimeout />
      </div>
    </PersonalViewProvider>
  );
}
