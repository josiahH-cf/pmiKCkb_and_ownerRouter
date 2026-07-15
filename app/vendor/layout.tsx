import type { ReactNode } from "react";

import { ReleaseStageBanner } from "@/components/layout/ReleaseStageBanner";

export default function VendorLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <ReleaseStageBanner />
      {children}
    </>
  );
}
