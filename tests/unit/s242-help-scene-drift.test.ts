import sharp from "sharp";
import { expect, it } from "vitest";
import { compareHelpScene } from "../../scripts/lib/help-scene-drift.mjs";

const picture = (width: number, height: number, background: string) =>
  sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();

it("keeps small raster color variation separate from a material change to one region", async () => {
  const expected = await picture(1280, 800, "#ffffff");
  const minor = await picture(1280, 800, "#f5f5f5");
  expect((await compareHelpScene(expected, minor)).material).toBe(false);

  const control = await picture(24, 16, "#172847");
  const changed = await sharp(expected)
    .composite([{ input: control, top: 32, left: 32 }])
    .png()
    .toBuffer();
  const comparison = await compareHelpScene(expected, changed);
  expect(comparison.material).toBe(true);
  expect(comparison.changedFraction).toBeLessThan(0.008);
});

it("catches a changed capture size", async () => {
  expect(
    await compareHelpScene(
      await picture(390, 800, "#ffffff"),
      await picture(391, 800, "#ffffff"),
    ),
  ).toMatchObject({
    material: true,
    expectedDimensions: [390, 800],
    observedDimensions: [391, 800],
  });
});

it("compares nearby controls while tolerating the independently verified cover SHA", async () => {
  const expected = await picture(128, 128, "#ffffff");
  const text = await picture(24, 16, "#172847");
  const changedSha = await sharp(expected)
    .composite([{ input: text, top: 32, left: 32 }])
    .png()
    .toBuffer();
  const bounds = { x: 32, y: 32, width: 24, height: 16 };
  expect((await compareHelpScene(expected, changedSha, [bounds])).material).toBe(false);

  const changedControl = await sharp(changedSha)
    .composite([{ input: text, top: 52, left: 32 }])
    .png()
    .toBuffer();
  expect((await compareHelpScene(expected, changedControl, [bounds])).material).toBe(
    true,
  );
});
