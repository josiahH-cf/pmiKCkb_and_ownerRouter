import type { Metadata } from "next";

import { VendorSetupBridge } from "@/components/vendor/VendorSetupBridge";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true },
};

export default function VendorSetupPage() {
  return <VendorSetupBridge />;
}
