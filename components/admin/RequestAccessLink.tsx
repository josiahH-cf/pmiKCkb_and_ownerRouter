import Link from "next/link";
import type { ReactNode } from "react";

import {
  buildSurfaceAccessRequestHref,
  type AccessIntentSurfaceKey,
} from "@/lib/access/intent-manifest";

export function RequestAccessLink({
  surface,
  children = "Request access",
  className,
}: Readonly<{
  surface: AccessIntentSurfaceKey;
  children?: ReactNode;
  className?: string;
}>) {
  return (
    <Link className={className} href={buildSurfaceAccessRequestHref(surface)}>
      {children}
    </Link>
  );
}
