import type { AuthenticatedUser } from "@/lib/auth/session";
import { listPlaceholders, listSops, listTemplates } from "@/lib/firestore/editable";
import type { PlaceholderRecord, SopRecord, TemplateRecord } from "@/lib/firestore/types";
import { launchApprovalQueueItems } from "@/lib/launch/content";
import { launchSpaces } from "@/lib/spaces";

export interface ApprovalQueueItem {
  id: string;
  kind: "SOP" | "Template" | "Placeholder";
  spaceId: string;
  spaceName: string;
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
    const items = await Promise.all(
      launchSpaces
        .filter((space) => !space.readOnly)
        .map(async (space) => {
          const [sops, templates, placeholders] = await Promise.all([
            loaders.listSops(user, space.id),
            loaders.listTemplates(user, space.id),
            loaders.listPlaceholders(user, space.id),
          ]);

          return [
            ...sops.map((sop) => ({
              id: sop.id,
              kind: "SOP" as const,
              spaceId: space.id,
              spaceName: space.name,
              status: sop.status,
              title: sop.title,
            })),
            ...templates.map((template) => ({
              id: template.id,
              kind: "Template" as const,
              spaceId: space.id,
              spaceName: space.name,
              status: template.status,
              title: template.name,
            })),
            ...placeholders.map((placeholder) => ({
              id: placeholder.id,
              kind: "Placeholder" as const,
              spaceId: space.id,
              spaceName: space.name,
              status: placeholder.status,
              title: placeholder.missing_detail,
            })),
          ] satisfies ApprovalQueueItem[];
        }),
    );

    return {
      apiBacked: true,
      items: items.flat(),
    };
  } catch {
    return {
      apiBacked: false,
      items: demoApprovalQueueItems(),
    };
  }
}

export function demoApprovalQueueItems(): ApprovalQueueItem[] {
  return launchApprovalQueueItems();
}
