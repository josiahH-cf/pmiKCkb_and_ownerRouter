import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const themeCss = readFileSync(join(root, "styles/theme.css"), "utf8");
const componentCss = [
  readFileSync(join(root, "styles/tokens.css"), "utf8"),
  readFileSync(join(root, "app/globals.css"), "utf8"),
].join("\n");

const REQUIRED_ROLES = [
  "ui-canvas",
  "ui-surface",
  "ui-surface-raised",
  "ui-surface-recessed",
  "ui-overlay",
  "ui-scrim",
  "ui-text",
  "ui-text-muted",
  "ui-text-placeholder",
  "ui-text-inverse",
  "ui-text-disabled",
  "field-required-text",
  "ui-border",
  "ui-border-strong",
  "ui-border-subtle",
  "ui-border-interactive",
  "ui-border-error",
  "ui-border-forced",
  "action-primary",
  "action-primary-hover",
  "action-primary-active",
  "action-primary-foreground",
  "action-secondary-fill",
  "action-secondary-hover",
  "action-secondary-active",
  "action-secondary-text",
  "action-secondary-border",
  "action-tertiary-fill",
  "action-tertiary-hover",
  "action-tertiary-active",
  "action-tertiary-text",
  "action-destructive",
  "action-destructive-hover",
  "action-destructive-active",
  "action-destructive-foreground",
  "action-disabled-fill",
  "action-disabled-text",
  "action-disabled-border",
  "action-link",
  "action-link-hover",
  "ui-focus",
  "ui-selected-surface",
  "ui-selected-text",
  "state-verified-text",
  "state-verified-icon",
  "state-verified-border",
  "state-verified-surface",
  "state-caution-text",
  "state-caution-icon",
  "state-caution-border",
  "state-caution-surface",
  "state-error-text",
  "state-error-icon",
  "state-error-border",
  "state-error-surface",
  "state-reference-text",
  "state-reference-icon",
  "state-reference-border",
  "state-reference-surface",
  "state-neutral-text",
  "state-neutral-icon",
  "state-neutral-border",
  "state-neutral-surface",
  "nav-work-tile",
  "nav-work-icon",
  "nav-operations-tile",
  "nav-operations-icon",
  "nav-admin-tile",
  "nav-admin-icon",
  "topbar-surface",
  "topbar-text",
  "topbar-accent",
  "brand-hero-surface",
  "brand-on-hero",
  "elevation-none",
  "elevation-raised",
  "elevation-overlay",
] as const;

const LEGACY_ALIASES = [
  "color-bg",
  "color-surface",
  "color-border",
  "color-text",
  "color-text-muted",
  "color-primary-900",
  "color-primary-700",
  "color-primary-500",
  "color-primary-100",
  "color-accent-700",
  "color-accent-500",
  "color-accent-100",
  "state-verified",
  "state-partial",
  "state-placeholder",
  "state-conflict",
  "state-no-source",
  "state-reference",
  "status-connected",
  "status-action",
  "status-none",
  "color-required",
  "shadow-floating",
  "font-size-sm",
  "color-bg-subtle",
  "color-primary",
] as const;

describe("S85 semantic token graph", () => {
  it("defines every required role in both Light and Dark without compatibility aliases", () => {
    const light = declarations(block(themeCss, ":root"));
    const dark = declarations(block(themeCss, 'html[data-theme="dark"]'));
    for (const role of REQUIRED_ROLES) {
      expect(light.has(role), `Light is missing --${role}`).toBe(true);
      expect(dark.has(role), `Dark is missing --${role}`).toBe(true);
    }
    for (const legacy of LEGACY_ALIASES) {
      expect(`${themeCss}\n${componentCss}`).not.toMatch(
        new RegExp(`--${legacy}(?![a-z0-9-])`, "i"),
      );
    }
    expect(themeCss.match(/--pmi-[a-z0-9-]+\s*:/g)?.sort()).toEqual(
      ["--pmi-black:", "--pmi-orange:", "--pmi-white:"].sort(),
    );
  });

  it("has no undefined variable reference or component-layer color literal", () => {
    const allCss = `${themeCss}\n${componentCss}`.replace(/\/\*[\s\S]*?\*\//g, "");
    const definitions = new Set(
      [...allCss.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((match) => match[1]),
    );
    const uses = [...allCss.matchAll(/var\(--([a-z0-9-]+)/gi)].map((match) => match[1]);
    // next/font defines --font-poppins on <html> at runtime (official PMI typeface); every css
    // use carries an explicit fallback family, so the reference is safe without a css definition.
    const externallyDefined = new Set(["font-poppins"]);
    expect(
      [...new Set(uses.filter((name) => !definitions.has(name)))].filter(
        (name) => !externallyDefined.has(name),
      ),
    ).toEqual([]);
    expect(componentCss.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(
      /#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla)\([^)]*\)/i,
    );
  });

  it("meets every declared text, state, action, and essential-boundary contrast floor", () => {
    for (const selector of [":root", 'html[data-theme="dark"]']) {
      const values = resolvedDeclarations(themeCss, selector);
      for (const background of [
        "ui-canvas",
        "ui-surface",
        "ui-surface-raised",
        "ui-surface-recessed",
      ]) {
        expectRatio(values, "ui-text", background, 4.5);
        expectRatio(values, "ui-text-muted", background, 4.5);
        expectRatio(values, "ui-text-placeholder", background, 4.5);
        expectRatio(values, "ui-text-disabled", background, 4.5);
      }
      for (const fill of [
        "action-primary",
        "action-primary-hover",
        "action-primary-active",
      ]) {
        expectRatio(values, "action-primary-foreground", fill, 4.5);
      }
      for (const fill of [
        "action-destructive",
        "action-destructive-hover",
        "action-destructive-active",
      ]) {
        expectRatio(values, "action-destructive-foreground", fill, 4.5);
      }
      expectRatio(values, "action-disabled-text", "action-disabled-fill", 4.5);
      expectRatio(values, "ui-selected-text", "ui-selected-surface", 4.5);
      for (const state of ["verified", "caution", "error", "reference", "neutral"]) {
        expectRatio(values, `state-${state}-text`, `state-${state}-surface`, 4.5);
      }
      for (const border of [
        "ui-border-interactive",
        "ui-border-error",
        "ui-border-forced",
      ]) {
        expectRatio(values, border, "ui-surface", 3);
        expectRatio(values, border, "ui-canvas", 3);
      }
    }
  });

  it("keeps device fallback, forced colors, reduced motion, and print explicit", () => {
    expect(themeCss).toContain("@media (prefers-color-scheme: dark)");
    expect(themeCss).toContain("@media (forced-colors: active)");
    expect(themeCss).toContain("ButtonBorder");
    expect(themeCss).toContain("Highlight");
    expect(themeCss).toContain("@media print");
    expect(componentCss).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

function block(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing CSS block ${selector}`);
  const bodyStart = css.indexOf("{", start) + 1;
  const bodyEnd = css.indexOf("}", bodyStart);
  return css.slice(bodyStart, bodyEnd);
}

function declarations(css: string) {
  return new Map(
    [...css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  );
}

function resolvedDeclarations(css: string, selector: string) {
  const sources = declarations(block(css, ":root"));
  const selected = declarations(block(css, selector));
  const values = new Map([...sources, ...selected]);
  const resolve = (name: string, seen = new Set<string>()): string => {
    if (seen.has(name)) throw new Error(`Theme token cycle at --${name}`);
    seen.add(name);
    const raw = values.get(name);
    if (!raw) throw new Error(`Missing theme token --${name}`);
    const reference = raw.match(/^var\(--([a-z0-9-]+)\)$/i)?.[1];
    return reference ? resolve(reference, seen) : raw;
  };
  return new Map([...values.keys()].map((name) => [name, resolve(name)]));
}

function expectRatio(
  values: Map<string, string>,
  foreground: string,
  background: string,
  minimum: number,
) {
  const ratio = contrast(values.get(foreground) ?? "", values.get(background) ?? "");
  expect(ratio, `--${foreground} on --${background}`).toBeGreaterThanOrEqual(minimum);
}

function contrast(foreground: string, background: string) {
  const first = luminance(hex(foreground));
  const second = luminance(hex(background));
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function hex(value: string) {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`Contrast fixture is not a six-digit hex color: ${value}`);
  return [0, 2, 4].map((offset) =>
    Number.parseInt(match[1].slice(offset, offset + 2), 16),
  );
}

function luminance(rgb: number[]) {
  const channels = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
