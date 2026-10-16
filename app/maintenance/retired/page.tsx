import Link from "next/link";
import {
  MAINTENANCE_HISTORY_PATH,
  MAINTENANCE_RETIREMENT_MESSAGE,
} from "@/lib/maintenance/retirement";

export default function MaintenanceRetiredPage() {
  return (
    <main className="content content--workspace ui-stack">
      <h1 className="section-title">Custom maintenance is retired</h1>
      <p>{MAINTENANCE_RETIREMENT_MESSAGE}</p>
      <p>
        <Link href={MAINTENANCE_HISTORY_PATH}>Read-only maintenance history</Link>
      </p>
      <p>
        <Link href="/lease-renewal">Open Lease Renewal</Link> ·{" "}
        <Link href="/">Open Dashboard</Link>
      </p>
    </main>
  );
}
