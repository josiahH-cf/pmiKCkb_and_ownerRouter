// Owner direction, 2026-09-10: the existing owner Admin session satisfies release
// browser acceptance. Editor authorization remains covered by backend tests.
export const OWNER_ADMIN_BROWSER_POLICY = "owner-admin-2026-09-10";
export const DUAL_ROLE_BROWSER_POLICY = "admin-editor";

export function requiresEditorBrowser(policy = DUAL_ROLE_BROWSER_POLICY) {
  if (policy === OWNER_ADMIN_BROWSER_POLICY) return false;
  if (policy === DUAL_ROLE_BROWSER_POLICY) return true;
  throw new Error("release_browser_policy_invalid");
}

export function browserVerdictsAccepted(policy, adminVerdict, editorVerdict) {
  return (
    adminVerdict === "passed" &&
    editorVerdict === (requiresEditorBrowser(policy) ? "passed" : "not_run")
  );
}
