export function pngSize(
  bytes: Buffer | undefined | null,
): { width: number; height: number } | null;
export function evaluateHelpScreenshots(inputs: {
  manual: {
    guides: readonly unknown[];
    screens: readonly unknown[];
    [key: string]: unknown;
  };
  manifest: {
    version: string;
    routeParameters: Record<string, string>;
    scenes: readonly unknown[];
  };
  helpVersion: string;
  images: Map<string, Buffer>;
  versions: readonly string[];
}): string[];
export function runHelpScreenshots(root?: string): string[];
