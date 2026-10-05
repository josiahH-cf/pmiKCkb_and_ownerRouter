import { Suspense, type ReactNode } from "react";

import { RenewalRouteLoading } from "@/components/lease-renewal/RenewalRouteLoading";

/**
 * One loading boundary shared by the worklist and the leases opened from it. It stays mounted
 * between them, so opening a lease keeps the worklist on screen until the lease is ready. A
 * first load of either still shows the placeholder.
 */
export default function RenewalDeskLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RenewalRouteLoading />}>{children}</Suspense>;
}
