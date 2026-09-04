import type { Metadata } from "next";

import { MaintenanceIntakeBridge } from "@/components/maintenance/MaintenanceIntakeBridge";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true },
};

export default function MaintenanceReportPage() {
  return <MaintenanceIntakeBridge />;
}
