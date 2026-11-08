const taskAnchors = {
  "admin-people-access": "people",
  "admin-activity-logs": "safety",
  "admin-runtime-suspensions": "safety",
  "admin-approval-notifications": "safety",
  "admin-support-reports": "safety",
  "admin-activity-log": "safety",
  "admin-app-readiness": "readiness",
  "admin-model-config": "readiness",
  "admin-renewal-notice-rules": "renewal",
  "admin-move-out-timing-basis": "renewal",
  "admin-policy-material": "renewal",
  "admin-renewal-packet-policy": "renewal",
  "admin-lease-artifact-intake": "renewal",
  "admin-owner-pricing-rules": "renewal",
  "admin-kb-corrections": "content",
  "admin-content-builder": "content",
  "admin-publication-policies": "content",
} as const;

export type AdminTask = (typeof taskAnchors)[keyof typeof taskAnchors];
export function adminTask(raw: unknown): AdminTask | null {
  return (Object.values(taskAnchors) as readonly unknown[]).includes(raw)
    ? (raw as AdminTask)
    : null;
}

export function adminTaskHref(href: string): string {
  if (!href.startsWith("/admin#")) return href;
  const anchor = href.slice("/admin#".length);
  if (!Object.hasOwn(taskAnchors, anchor)) return href;
  return `/admin?task=${taskAnchors[anchor as keyof typeof taskAnchors]}#${anchor}`;
}
