// Compiled owning-component fixtures. The harness mounts these only in its private local checkout.
// They do not authenticate a Vendor, change claims, or replace any deployed route's guard.
import { VendorPortal } from "@/components/vendor/VendorPortal";
import { RentSuggestionApproval } from "@/components/lease-renewal/RentSuggestionApproval";
import { SupportReportStatusControl } from "@/components/admin/SupportReportStatusControl";
import { FeedbackRecoveryFixture } from "./feedback-recovery-fixture";
import { CommunicationsRetentionAdminPanel } from "@/components/admin/CommunicationsRetentionAdminPanel";
import { OperationalPageBuilderPanel } from "@/components/admin/OperationalPageBuilderPanel";

export function RecoveryFixturePage() {
  return (
    <main className="vendor-shell ui-stack">
      <h1>Local owning recovery fixtures</h1>
      <section className="panel ui-stack" aria-label="Rent suggestion">
        <RentSuggestionApproval leaseId="fixture-local-recovery" />
      </section>
      <section className="panel ui-stack" aria-label="Feedback status">
        <SupportReportStatusControl reportId="fixture-local-report" status="new" />
      </section>
      <FeedbackRecoveryFixture />
      <section className="panel ui-stack" aria-label="Retention decision recovery">
        <CommunicationsRetentionAdminPanel />
      </section>
      <section className="panel ui-stack" aria-label="Operational page recovery">
        <OperationalPageBuilderPanel
          spaces={[{ id: "local-space", name: "Local Space" }]}
        />
      </section>
    </main>
  );
}

export async function VendorFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  return (
    <VendorPortal
      email="vendor@fixture.invalid"
      tickets={
        state === "empty"
          ? []
          : Array.from({ length: 8 }, (_, index) => ({
              id: `local-fixture-ticket-${index}`,
              status: "Assigned",
              priority: "Normal",
              summary: `Local assigned-ticket fixture ${index + 1}: ${"LongUnbrokenFixtureSummary".repeat(12)}`,
              unitLabel: `${"Long fixture unit description. ".repeat(12)}`,
              updatedAt: "2026-10-04T00:00:00.000Z",
              dataMode: "live" as const,
            }))
      }
    />
  );
}
