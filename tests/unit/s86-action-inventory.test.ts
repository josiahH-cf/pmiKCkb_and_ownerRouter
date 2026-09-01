import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { S86_ACTION_INVENTORY } from "@/lib/ui/action-inventory";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path: string) => readFileSync(join(root, path), "utf8");

const MIGRATED_COMPONENTS = [
  "components/connections/ConnectorSetupActions.tsx",
  "components/spaces/SpaceDetailClient.tsx",
  "components/approval/ApprovalQueue.tsx",
  "components/admin/UserManagementPanel.tsx",
  "components/admin/PublicationPolicyAdminPanel.tsx",
  "components/maintenance/UnverifiedIntakeReview.tsx",
  "components/maintenance/MaintenanceQueue.tsx",
  "components/layout/NotificationMenu.tsx",
] as const;

describe("S86 exact v1 action inventory", () => {
  it("classifies every named action exactly once without widening ownership", () => {
    expect(S86_ACTION_INVENTORY.map((entry) => entry.id)).toEqual([
      "connector.disconnect",
      "template.retire",
      "approval.high_risk.single",
      "approval.high_risk.bulk",
      "admin.user.role_change",
      "admin.user.space_scope_change",
      "publication.policy.disable",
      "maintenance.intake.dismiss",
      "maintenance.intake.promote",
      "maintenance.ticket.close_or_reopen",
      "notification.mark_all_or_mute",
      "exact_preview.controls.preserve",
    ]);
    expect(new Set(S86_ACTION_INVENTORY.map((entry) => entry.id)).size).toBe(
      S86_ACTION_INVENTORY.length,
    );
    expect(
      S86_ACTION_INVENTORY.find((entry) => entry.id === "connector.disconnect"),
    ).toMatchObject({ owner: "S96", tier: "C", mode: "preservation-only" });
    expect(
      S86_ACTION_INVENTORY.find(
        (entry) => entry.id === "exact_preview.controls.preserve",
      ),
    ).toMatchObject({ mode: "preservation-only" });
  });

  it("covers every audited component and removes browser-native confirmation", () => {
    const covered = new Set(S86_ACTION_INVENTORY.flatMap((entry) => entry.components));
    for (const path of MIGRATED_COMPONENTS) {
      expect(covered, `Missing S86 action inventory coverage for ${path}`).toContain(
        path,
      );
      const source = read(path);
      expect(source, `${path} still uses window.confirm`).not.toMatch(
        /window\.confirm\s*\(/,
      );
      expect(source, `${path} still uses window.prompt`).not.toMatch(
        /window\.prompt\s*\(/,
      );
    }
  });

  it("keeps shared presentation primitives free of provider/store dispatch", () => {
    for (const path of [
      "components/ui/ActionLink.tsx",
      "components/ui/BusyIndicator.tsx",
      "components/ui/ConfirmationDialog.tsx",
      "components/ui/Icon.tsx",
      "components/ui/InfoTip.tsx",
      "components/ui/Notice.tsx",
      "components/ui/PageState.tsx",
    ]) {
      const source = read(path);
      expect(source, `${path} must not dispatch a request`).not.toMatch(/\bfetch\s*\(/);
      expect(
        source,
        `${path} must not import provider or store business logic`,
      ).not.toMatch(
        /lib\/(?:firestore|integrations|connections\/connection-store|connections\/vault)/,
      );
    }
  });

  it("removes native-title-only explanations from the audited disabled/context controls", () => {
    for (const path of [
      "components/approval/ApprovalQueueDetailPanel.tsx",
      "components/layout/EnvironmentBadge.tsx",
      "components/layout/AppShell.tsx",
    ]) {
      expect(read(path), `${path} still relies on native title help`).not.toMatch(
        /\btitle\s*=/,
      );
    }
  });
});
