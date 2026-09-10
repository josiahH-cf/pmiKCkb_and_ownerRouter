export type ReleaseBrowserPolicy = "owner-admin-2026-09-10" | "admin-editor";
export const OWNER_ADMIN_BROWSER_POLICY: "owner-admin-2026-09-10";
export const DUAL_ROLE_BROWSER_POLICY: "admin-editor";
export function requiresEditorBrowser(policy?: ReleaseBrowserPolicy): boolean;
export function browserVerdictsAccepted(
  policy: ReleaseBrowserPolicy | undefined,
  adminVerdict: string,
  editorVerdict: string,
): boolean;
