# PMI App Brand Pack - LLM-Friendly Context

Use this as structured context for another model. This is a source-constrained context pack. It intentionally keeps unknown values as **not specified in the available source** rather than guessing.

## Critical anti-hallucination rules

1. Do not invent PMI brand facts.
2. Do not assign HEX, RGB, CMYK, PMS, or gradient values to PMI colors unless a later official PMI source provides them.
3. Do not name PMI typefaces, weights, sizes, or hierarchy rules unless a later official PMI source provides them.
4. Do not use the Cherry Bridge reference PDF's brand content, colors, fonts, gradients, or wording as PMI content.
5. Do not treat presentation approximations in the PDF as official PMI colors.
6. Use `null` for unknown structured values, and use the wording `not specified in the available source` in prose.

## Source status vocabulary

- `confirmed_from_page_shell`: fact visible in the Flipsnack page shell.
- `confirmed_from_publication_title`: fact visible in the publication title.
- `observed_on_visible_cover_preview`: fact visible in the cover preview.
- `inferred_from_visible_usage_only`: practical app implication derived conservatively from visible usage; not a complete PMI rule.
- `not_specified_in_available_source`: unavailable in the extracted source; do not guess.

## Confirmed brand/publication identity

| Field | Value | Status |
|---|---:|---|
| Brand short name | PMI | confirmed_from_publication_title |
| Publisher/company shown | Property Management Inc. | confirmed_from_page_shell |
| Publication title | PMI Brand Style Guide - 071525 | confirmed_from_page_shell |
| Published date shown | October 11, 2024 | confirmed_from_page_shell |
| Visible wordmark text | pmi. | observed_on_visible_cover_preview |
| Visible tagline | the property management people | observed_on_visible_cover_preview |
| Visible cover label | Brand Book / Style Guide | observed_on_visible_cover_preview |
| Source URL | https://www.flipsnack.com/C67D66CC5A8/pmi-brand-style-guide-v1-0/full-view.html | source reference |

## Logo system

### Observed elements

- Orange angular icon: observed on the visible cover preview.
- Lowercase wordmark: `pmi.` exactly, including lowercase letters and trailing period.
- Tagline: `the property management people` exactly.
- Orange tagline and black cover field were observed on the visible cover preview.

### Logo rules not specified

- Clearspace: not specified in the available source.
- Minimum size: not specified in the available source.
- Alternate lockups: not specified in the available source.
- One-color rules: not specified in the available source.
- Logo file formats: not specified in the available source.
- Co-branding rules: not specified in the available source.

### App implications

- Keep a high-contrast lockup zone for visible brand moments.
- Use official PMI vector artwork for production app assets.
- Do not trace or redraw the preview logo for release assets.
- Avoid color/value substitutions until official tokens are obtained.

## Color system

Exact official PMI color values were **not specified in the available source**. The PDF used approximate fills for presentation only; those values are intentionally not included here to prevent accidental promotion to official design tokens.

| Token | Display name | Observed role | Official HEX | Official RGB | Official CMYK | Official PMS | Production value status |
|---|---|---|---|---|---|---|---|
| `brand.black` | Cover black | primary cover/background | null | null | null | null | not specified in the available source |
| `brand.white` | Logo white | `pmi.` wordmark on black cover | null | null | null | null | not specified in the available source |
| `brand.orange` | PMI orange | icon, tagline, accent rules | null | null | null | null | not specified in the available source |

### Color usage guidance for app UI

- High-contrast brand moments: use the black/orange/white identity for launch, sign-in, hero, and brand transition screens only when values are official or when prototypes are explicitly labeled non-production.
- Orange as active signal: orange appears as icon/tagline/accent. It may be used for key actions only after official contrast values are validated.
- Neutral app surfaces: use plain white or neutral surfaces for long tasks, forms, and tables. Avoid heavy black backgrounds for dense operational workflows.
- Design tokens: create placeholder tokens only; leave values `null` until official specs are obtained.

### Gradients

Official PMI gradients are **not specified in the available source**. Do not infer gradients from the reference PDF or from approximate cover colors.

## Typography

Official PMI typography is **not specified in the available source**.

Unavailable:

- Official font names: not specified in the available source.
- Font weights: not specified in the available source.
- Font sizes: not specified in the available source.
- Hierarchy rules: not specified in the available source.

Guidance:

- Do not infer the complete typography system from the cover image.
- Use official PMI typefaces when obtained.
- Until official fonts are obtained, keep any working app prototype typography explicitly labeled as non-brand fallback.
- Any fallback font shown in the visual PDF is a usability placeholder, not a PMI brand fact.

## App-facing component guidance

These are source-safe implications from the visible cover identity, not complete PMI UI rules.

| Component | Guidance |
|---|---|
| Splash / launch | Use the visible black/orange/white identity as a brand moment, with official assets and official color values before release. |
| Top navigation | Keep compact. Avoid unverified logo variants or redrawn marks. |
| Primary actions | Orange may act as the brand accent only after contrast is validated and official color values are obtained. |
| Forms / tables | Use neutral surfaces and clear typography. Official fonts are not specified. |
| Design tokens | Create placeholder tokens only; leave values `null` until official specs are obtained. |

## Graphic language

### Supported observations

- Angular orange symbol.
- Black field.
- White lowercase wordmark.
- Thin cover rules.

### Not specified

- Icon set: not specified in the available source.
- Illustration style: not specified in the available source.
- Pattern library: not specified in the available source.
- Motion behavior: not specified in the available source.
- Full graphic motif rules: not specified in the available source.

### App use

- Use the angular brand motif only as a restrained accent or transition, and only when official assets are available.
- Do not over-pattern operational screens.
- Use official files for icons and marks when available.
- Do not trace the preview for release assets.

## Imagery

Status: not specified in the available source.

Unavailable:

- Photography rules.
- Image treatments.
- Subject-matter guidance.

Rule: do not infer image style from unrelated PMI sources.

## Tone of voice

Status: not specified in the available source except for the visible tagline.

Available:

- Visible tagline: `the property management people`.

Unavailable:

- Copywriting principles.
- Messaging hierarchy.
- Voice and tone adjectives.

## Accessibility

Status: not specified in the available source.

Unavailable:

- Contrast ratios.
- Alt-text rules.
- UI state guidance.
- Accessible color pairings.

App implication: build the app with accessible product defaults now; replace visual placeholders only when official PMI typography, palette, imagery, and accessibility requirements are obtained. Contrast validation is required before release.

## Do / Don't guidance

### Do

- Use the exact visible name styling `pmi.` when referencing the visible wordmark.
- Preserve the tagline wording: `the property management people`.
- Treat orange, black, and white as observed visual roles only until exact specs are obtained.
- Use official logo artwork for production app assets.
- Keep unavailable brand specs clearly marked in design tickets.

### Don't

- Do not publish approximate fills as PMI HEX/RGB/CMYK/PMS values.
- Do not invent typefaces, spacing, clearspace, gradients, icons, or imagery rules.
- Do not redraw the preview logo for app release builds.
- Do not mix this visible identity with unrelated or legacy marks without source support.
- Do not overuse the dark cover treatment for dense functional screens.

## Handoff checklist

### Usable now

- Publication identity: PMI Brand Style Guide - 071525 / Property Management Inc.
- Visible cover lockup reference: `pmi.` + tagline + orange angular mark.

### Use with caution

- App mockups may use approximated black/orange/white fills for conversation only. Label them as non-production.

### Needed before release

- Official logo files and usage rules.
- Official color specifications and accessibility-confirmed UI tokens.
- Official typefaces, iconography, imagery, and motion/graphic rules.

## Source notes

PMI source material used:

- Flipsnack publication page shell: title, publisher, publication date.
- Visible cover preview: orange angular icon, lowercase `pmi.` wordmark, orange tagline, black cover field, Brand Book / Style Guide label.
- Public full-view page extraction: cookie/banner shell only; no reliable interior page text, official color values, or typeface rules were exposed in the available extraction workflow.

Reference PDF usage:

- The attached Cherry Bridge guide was used only as a visual structure benchmark: section titles, spacing, swatches, callouts, footers, and page numbers.
- No reference brand names, palette values, fonts, gradients, or wording were used as PMI content.

Final status: source-constrained brand pack; not a substitute for complete official PMI brand guide files.
