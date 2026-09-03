import Link from "next/link";
import type { ReactNode } from "react";

import {
  accessIntentManifestEntry,
  buildSurfaceAccessRequestHref,
  type AccessIntentSurfaceKey,
} from "@/lib/access/intent-manifest";
import { buildAccessRequestHref, validateAccessReturnTarget } from "@/lib/access/handoff";

export function RequestAccessLink({
  surface,
  children = "Request access",
  className,
  returnTo,
}: Readonly<{
  surface: AccessIntentSurfaceKey;
  children?: ReactNode;
  className?: string;
  /** Optional surface-specific return; validated by the same closed S83 destination contract. */
  returnTo?: string;
}>) {
  const href =
    returnTo === undefined
      ? buildSurfaceAccessRequestHref(surface)
      : (() => {
          const entry = accessIntentManifestEntry(surface);
          return buildAccessRequestHref({
            capability: entry.capability,
            space: "space" in entry ? entry.space : undefined,
            returnTo: validateAccessReturnTarget(returnTo),
          });
        })();
  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}
