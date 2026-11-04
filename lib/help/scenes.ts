// S243 R-S243-5: typed access to the scene manifest. The manifest is JSON so the capture script
// (plain Node) and the pages read the same file. Each scene names its guide step, route, role,
// synthetic fixture state, viewport, framed region and capture source.
import manifest from "@/lib/help/content/scenes.json";

export interface HelpScene {
  readonly id: string;
  readonly guide: string;
  readonly step: string;
  readonly route: string;
  readonly role: "Editor" | "Approver" | "Admin";
  /** The synthetic fixture state the scene needs, in plain words. */
  readonly fixture: string;
  readonly viewport: { readonly width: number; readonly height: number };
  /** `role:Name`, a bare region name, `css:<selector>`, or `page` (the top of the page as it opens). */
  readonly region: string;
  readonly frame: "viewport" | "region";
  /** viewport frames: put the region at the top (default) or in the middle of the viewport. */
  readonly align?: "top" | "center";
  readonly actions?: readonly string[];
  readonly source: "rehearsal" | "production-blurred";
  readonly alt: string;
  readonly caption: string;
  /** production-blurred only: why the rehearsal cannot show the state, when and who blurred it. */
  readonly reason?: string;
  readonly date?: string;
  readonly attestation?: string;
}

export interface HelpSceneManifest {
  readonly version: string;
  readonly routeParameters: Readonly<Record<string, string>>;
  readonly outlineRoutes?: readonly string[];
  readonly scenes: readonly HelpScene[];
}

export const HELP_SCENE_MANIFEST = manifest as HelpSceneManifest;

export function helpScene(id: string): HelpScene | undefined {
  return HELP_SCENE_MANIFEST.scenes.find((scene) => scene.id === id);
}
