export function compareHelpScene(
  expected: Buffer,
  observed: Buffer,
): Promise<{
  readonly material: boolean;
  readonly reason: string;
  readonly changedFraction?: number;
  readonly mostChangedTile?: number;
  readonly expectedDimensions?: readonly [number, number];
  readonly observedDimensions?: readonly [number, number];
}>;
