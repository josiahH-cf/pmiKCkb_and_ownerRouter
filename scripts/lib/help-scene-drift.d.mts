export function compareHelpScene(
  expected: Buffer,
  observed: Buffer,
  verifiedText?: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[],
): Promise<{
  readonly material: boolean;
  readonly reason: string;
  readonly changedFraction?: number;
  readonly mostChangedTile?: number;
  readonly expectedDimensions?: readonly [number, number];
  readonly observedDimensions?: readonly [number, number];
}>;
