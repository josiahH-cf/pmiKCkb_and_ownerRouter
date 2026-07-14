import type { PublicationScanner } from "@/lib/publication/types";
import { UnavailablePublicationScanner } from "@/lib/publication/scanners";

/**
 * Production provider activation is an explicit S21 owner/vendor gate. Until a real
 * provider is configured, every route fails closed instead of substituting a fake.
 */
export function resolvePublicationScanner(scannerKey: string): PublicationScanner {
  return new UnavailablePublicationScanner(scannerKey);
}
