import { HELP_CHANGELOG } from "@/lib/help/content/changelog";
import { helpScene } from "@/lib/help/scenes";
import { HELP_ASSET_ROOT, HELP_VERSION } from "@/lib/help/version";

/** Keep old picture embeds working when the current capture folder moves. */
export function previousHelpPictureDestination(method: string, pathname: string) {
  if ((method !== "GET" && method !== "HEAD") || !pathname.startsWith("/help/"))
    return null;
  const match = /^\/help\/(V[1-9]\d*\.\d+)\/([a-z0-9-]+)\.png$/.exec(pathname);
  if (!match) return null;
  const [, version, id] = match;
  if (
    version === HELP_VERSION ||
    !HELP_CHANGELOG.some((entry) => entry.version === version) ||
    !helpScene(id)
  )
    return null;
  return `${HELP_ASSET_ROOT}/${id}.png`;
}
