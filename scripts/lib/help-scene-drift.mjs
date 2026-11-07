// Compare the same scene at the same device scale. Color differences below 24 tolerate small
// antialiasing variation. The tile bound catches a local change even on a mostly empty viewport.
import sharp from "sharp";

export async function compareHelpScene(expected, observed) {
  const pixels = async (image) =>
    sharp(image)
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
  const [before, after] = await Promise.all([pixels(expected), pixels(observed)]);
  const { width, height, channels } = before.info;
  if (
    width !== after.info.width ||
    height !== after.info.height ||
    channels !== after.info.channels
  )
    return {
      material: true,
      reason: "Captured dimensions changed.",
      expectedDimensions: [width, height],
      observedDimensions: [after.info.width, after.info.height],
    };

  const tileSize = 32;
  const columns = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const tileChanges = new Uint32Array(columns * rows);
  let changed = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels;
      const difference = Math.max(
        Math.abs(before.data[index] - after.data[index]),
        Math.abs(before.data[index + 1] - after.data[index + 1]),
        Math.abs(before.data[index + 2] - after.data[index + 2]),
      );
      if (difference < 24) continue;
      changed += 1;
      tileChanges[Math.floor(y / tileSize) * columns + Math.floor(x / tileSize)] += 1;
    }
  const changedFraction = changed / (width * height);
  const mostChangedTile = Math.max(...tileChanges) / (tileSize * tileSize);
  return {
    material: changedFraction >= 0.008 || mostChangedTile >= 0.12,
    reason: "Compared changed pixels in the whole scene and in each 32 × 32 pixel tile.",
    changedFraction,
    mostChangedTile,
  };
}
