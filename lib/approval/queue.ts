import type { AuthenticatedUser } from "@/lib/auth/session";
import { demoLeaseRenewals } from "@/lib/demo/data";
import { listPlaceholders, listSops, listTemplates } from "@/lib/firestore/editable";
import type { PlaceholderRecord, SopRecord, TemplateRecord } from "@/lib/firestore/types";

export interface ApprovalQueueItem {
  id: string;
  kind: "SOP" | "Template" | "Placeholder";
  status: string;
  title: string;
}

type QueueSop = Pick<SopRecord, "id" | "status" | "title">;
type QueueTemplate = Pick<TemplateRecord, "id" | "name" | "status">;
type QueuePlaceholder = Pick<PlaceholderRecord, "id" | "missing_detail" | "status">;

interface ApprovalQueueLoaders {
  listPlaceholders: (
    user: AuthenticatedUser,
    spaceId: string,
  ) => Promise<QueuePlaceholder[]>;
  listSops: (user: AuthenticatedUser, spaceId: string) => Promise<QueueSop[]>;
  listTemplates: (user: AuthenticatedUser, spaceId: string) => Promise<QueueTemplate[]>;
}

export async function loadApprovalQueue(
  user: AuthenticatedUser,
  loaders: ApprovalQueueLoaders = {
    listPlaceholders,
    listSops,
    listTemplates,
  },
) {
  try {
    const [sops, templates, placeholders] = await Promise.all([
      loaders.listSops(user, "lease-renewals"),
      loaders.listTemplates(user, "lease-renewals"),
      loaders.listPlaceholders(user, "lease-renewals"),
    ]);

    return {
      apiBacked: true,
      items: [
        ...sops.map((sop) => ({
          id: sop.id,
          kind: "SOP" as const,
          status: sop.status,
          title: sop.title,
        })),
        ...templates.map((template) => ({
          id: template.id,
          kind: "Template" as const,
          status: template.status,
          title: template.name,
        })),
        ...placeholders.map((placeholder) => ({
          id: placeholder.id,
          kind: "Placeholder" as const,
          status: placeholder.status,
          title: placeholder.missing_detail,
        })),
      ] satisfies ApprovalQueueItem[],
    };
  } catch {
    return {
      apiBacked: false,
      items: demoApprovalQueueItems(),
    };
  }
}

export function demoApprovalQueueItems(): ApprovalQueueItem[] {
  return [
    ...demoLeaseRenewals.sops.map((sop) => ({
      id: sop.id,
      kind: "SOP" as const,
      status: sop.status,
      title: sop.title,
    })),
    ...demoLeaseRenewals.templates.map((template) => ({
      id: template.id,
      kind: "Template" as const,
      status: template.status,
      title: template.name,
    })),
    ...demoLeaseRenewals.placeholders.map((placeholder) => ({
      id: placeholder.id,
      kind: "Placeholder" as const,
      status: placeholder.status,
      title: placeholder.missing_detail,
    })),
  ];
}
