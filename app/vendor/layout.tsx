import type { ReactNode } from "react";
import { Appearance } from "@/components/layout/Appearance";

export default function VendorLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="vendor-theme-shell">
      <div className="vendor-appearance">
        <Appearance />
      </div>
      {children}
    </div>
  );
}
