import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// These pure validation cases run inside the ordinary isolated unit lane. They perform no
// acquisition and never turn synthetic bytes into a qualified public font cache/build result.
const python = String.raw`
import base64,importlib.util,json,pathlib,sys,tempfile
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('public_fonts',pathlib.Path('scripts/isolation/public-fonts.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
value=json.load(sys.stdin)
try:
 if value['kind']=='css': result=module.validate_css(value['value'])
 elif value['kind']=='url': result=module.font_url(value['value'])
 elif value['kind']=='woff': result=module.validate_woff2(base64.b64decode(value['value']))
 elif value['kind']=='map': result=module.response_map(module.CSS_URL,value['value'])
 elif value['kind']=='loopback_css':
  runtime_spec=importlib.util.spec_from_file_location('font_runtime',pathlib.Path('scripts/isolation/font-loopback.py'))
  runtime=importlib.util.module_from_spec(runtime_spec);runtime_spec.loader.exec_module(runtime)
  result=runtime.css_for_loopback(value['value']['css'],value['value']['fonts'],value['value']['base'])
 elif value['kind']=='empty_cache':
  with tempfile.TemporaryDirectory() as root: result=module.validate_cache(pathlib.Path(root))
 else: raise ValueError('Unexpected fixture mode')
 print(json.dumps({'accepted':True,'result':result}))
except (ValueError,OSError,KeyError) as error:
 print(json.dumps({'accepted':False,'errorClass':type(error).__name__}))
`;

function check(kind, value) {
  return JSON.parse(
    execFileSync("/usr/bin/python3", ["-c", python], {
      input: JSON.stringify({ kind, value }),
      encoding: "utf8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      timeout: 5000,
    }),
  );
}

const css = ["300", "400", "600", "700"]
  .map(
    (weight) => `/* latin */
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/poppins/v0/synthetic-${weight}.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}`,
  )
  .join("\n");

const runtimeFonts = ["300", "400", "600", "700"].map((weight, index) => {
  const digest = String(index + 1).repeat(64);
  return {
    url: `https://fonts.gstatic.com/s/poppins/v0/synthetic-${weight}.woff2`,
    file: `${digest}.woff2`,
    sha256: digest,
  };
});
const runtimeBase = `http://127.0.0.1:54321/${"a".repeat(32)}/`;

describe("public font dependency boundary", () => {
  it("requires all four declared weights and preserves their public URL identities", () => {
    const result = check("css", css);
    expect(result.accepted).toBe(true);
    expect(result.result).toEqual(
      ["300", "400", "600", "700"].map(
        (weight) => `https://fonts.gstatic.com/s/poppins/v0/synthetic-${weight}.woff2`,
      ),
    );
  });

  it.each([
    "http://fonts.gstatic.com/s/poppins/v0/font.woff2",
    "https://fonts.gstatic.com.evil.invalid/s/poppins/v0/font.woff2",
    "https://synthetic@fonts.gstatic.com/s/poppins/v0/font.woff2",
    "https://fonts.gstatic.com:444/s/poppins/v0/font.woff2",
    "https://fonts.gstatic.com/s/other/v0/font.woff2",
    "https://fonts.gstatic.com/s/poppins/../private/font.woff2",
    "https://fonts.gstatic.com/s/poppins/%2e%2e/private/font.woff2",
    "https://fonts.gstatic.com/s/poppins/v0/font.woff2?redirect=private",
    "file:///synthetic-host-only/font.woff2",
  ])("refuses an unreviewed asset destination: %s", (url) => {
    expect(check("url", url).accepted).toBe(false);
  });

  it.each([
    css.replace("font-weight: 700", "font-weight: 800"),
    css.replaceAll("'Poppins'", "'Other family'"),
    css.replace("font-display: swap", "font-display: block"),
    `${css}\n@import url(https://synthetic.invalid/private.css);`,
    `${css}\nbody { background: url(https://synthetic.invalid/pixel); }`,
    css.replace("font-style: normal", "font-style: normal; font-style: italic"),
    css.replace("https://fonts.gstatic.com", "https://synthetic.invalid"),
  ])("rejects incomplete or additional CSS behavior", (value) => {
    expect(check("css", value).accepted).toBe(false);
  });

  it("refuses the installed hook's fake nonlocal-URL buffer behavior", () => {
    const bytes = Buffer.from("https://fonts.gstatic.com/s/poppins/v0/font.woff2");
    expect(check("woff", bytes.toString("base64")).accepted).toBe(false);
  });

  it("refuses an empty/partial cache before any application command", () => {
    expect(check("empty_cache").accepted).toBe(false);
  });

  it("keeps Poppins CSS while using digest-only HTTP URLs inside the isolated namespace", () => {
    const result = check("loopback_css", {
      css,
      fonts: runtimeFonts,
      base: runtimeBase,
    });
    expect(result.accepted).toBe(true);
    for (const font of runtimeFonts) {
      expect(result.result).toContain(`url(${runtimeBase}${font.file})`);
      expect(result.result).not.toContain(font.url);
    }
    expect(result.result.match(/font-family: 'Poppins'/g)).toHaveLength(4);
    expect(result.result).not.toContain("url(/opt/");
  });

  it.each([
    `https://127.0.0.1:54321/${"a".repeat(32)}/`,
    `http://localhost:54321/${"a".repeat(32)}/`,
    `http://192.0.2.1:54321/${"a".repeat(32)}/`,
    `http://user@127.0.0.1:54321/${"a".repeat(32)}/`,
    `http://127.0.0.1:0/${"a".repeat(32)}/`,
    `http://127.0.0.1:54321/../${"a".repeat(32)}/`,
    `http://127.0.0.1:54321/${"a".repeat(32)}/?redirect=1`,
    "http://127.0.0.1:54321/no-nonce/",
  ])(
    "refuses any runtime URL beyond its exact isolated loopback contract: %s",
    (base) => {
      expect(check("loopback_css", { css, fonts: runtimeFonts, base }).accepted).toBe(
        false,
      );
    },
  );

  it("refuses a traversal asset and an incomplete runtime catalog", () => {
    expect(
      check("loopback_css", {
        css,
        fonts: runtimeFonts.map((font, index) =>
          index === 0 ? { ...font, file: "../outside.woff2" } : font,
        ),
        base: runtimeBase,
      }).accepted,
    ).toBe(false);
    expect(
      check("loopback_css", {
        css,
        fonts: runtimeFonts.slice(1),
        base: runtimeBase,
      }).accepted,
    ).toBe(false);
  });

  it("serializes even hostile public CSS comments as data, never executable code", () => {
    const text = `/* "; throw new Error('executed'); // \u2028 */\n${css}`;
    const result = check("map", text);
    expect(result.accepted).toBe(true);
    const context = { module: { exports: null } };
    runInNewContext(result.result, context, { timeout: 1000 });
    expect(
      context.module.exports[
        "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap"
      ],
    ).toBe(text);
  });
});
