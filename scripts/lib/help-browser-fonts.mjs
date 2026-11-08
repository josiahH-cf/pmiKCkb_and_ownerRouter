import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// Ubuntu 24.04's DejaVu core and mono 2.37-8 and Liberation 1:2.1.5-3.
// Chromium uses these for glyphs and native controls that Poppins does not cover.
const FALLBACK_FONTS = {
  "dejavu/DejaVuSans-Bold.ttf":
    "5c1247acef7f2b8522a31742c76d6adcb5569bacc0be7ceaa4dc39dd252ce895",
  "dejavu/DejaVuSans.ttf":
    "ae7b7855e115a5966d8b1b3f80f254ccc117ec86f9965e202ee2940453837280",
  "dejavu/DejaVuSansMono-Bold.ttf":
    "3a3c502eeff669a231549e80df9f7c49de109bafe303170409e905d0b31a38fe",
  "dejavu/DejaVuSansMono-BoldOblique.ttf":
    "a5251173370e30760e6919711dcd33e149d216ca4814eb74332bda03fcc7e834",
  "dejavu/DejaVuSansMono-Oblique.ttf":
    "3d7955616e69721f7edb8e1b7a580f8fbd7d737111c6b54266ddc1d9ef13202f",
  "dejavu/DejaVuSansMono.ttf":
    "c805f9436dbc268644c1d9584f01a601a653e028e08fd74b9b949f6cf8304d88",
  "dejavu/DejaVuSerif-Bold.ttf":
    "847b33e13925f19ff87e4d934d6b3cf7cac35ce16424f6f670e40c2f377cf2df",
  "dejavu/DejaVuSerif.ttf":
    "8f2c103bfa3fd5de71f1b92b18f21906b5a26871fb7e19a9a4c9af539c3cc7ab",
  "liberation/LiberationMono-Bold.ttf":
    "626655e94dd82f3f42549daf995c921b0915fa8ab1f4b839559e8892ea41d240",
  "liberation/LiberationMono-BoldItalic.ttf":
    "15eb161953e3ecc7fc05a3fec8a59e0f4e0a54a4e375736adf8e98d65981f813",
  "liberation/LiberationMono-Italic.ttf":
    "a71b2c25c89da05cf0e7c4dbba8d473fdead0b181ae56165217747d2c1f39215",
  "liberation/LiberationMono-Regular.ttf":
    "395fa5ab8d40c8eba390ced528744ea75a7f69aabf3e68b6f925ca0e39a27370",
  "liberation/LiberationSans-Bold.ttf":
    "3973aa5054fb467dd5627245d3dc82e37bf16fe075756156a570455871351582",
  "liberation/LiberationSans-BoldItalic.ttf":
    "c80fa7f2ffa0e01d4d8dcd6a6d1e43eda665222d1b4db597dde1174c456006cf",
  "liberation/LiberationSans-Italic.ttf":
    "830c5fa600505fb4c1a271b4271c53c44bae43f492b2a240d0e98a3a7a380121",
  "liberation/LiberationSans-Regular.ttf":
    "4659bc0c58c5028dd488ec928d41d9265db43d9b669fc14ca8b0832daca7b144",
  "liberation/LiberationSerif-Bold.ttf":
    "9e66c25e20868756bf12eb24a520a4552727c9cd108f577f7ae33e3c0110e39c",
  "liberation/LiberationSerif-BoldItalic.ttf":
    "379010e87421a883f7bbfa7936d23dfe0257a54ce850819b74556e9f2c615a8a",
  "liberation/LiberationSerif-Italic.ttf":
    "eaeaf7f2b12544ecde64290c1fa7ec403ff70fd58b313637b265400b20249242",
  "liberation/LiberationSerif-Regular.ttf":
    "705903ae1382f0150f115d6f10a30f5b2f3d6ade649c474afe6366c39174fb65",
};

/** Make the required capture and verification use the same fallback font files. */
export function prepareHelpBrowserFonts(output) {
  const root = join(output, "browser-fonts");
  const fonts = join(root, "fonts");
  mkdirSync(root);
  mkdirSync(fonts);
  for (const [file, sha] of Object.entries(FALLBACK_FONTS)) {
    const data = readFileSync(join("/usr/share/fonts/truetype", file));
    assert.equal(createHash("sha256").update(data).digest("hex"), sha, file);
    writeFileSync(join(fonts, basename(file)), data);
  }
  const config = join(root, "fonts.conf");
  copyFileSync(new URL("../isolation/help-browser-fonts.conf", import.meta.url), config);
  return config;
}
