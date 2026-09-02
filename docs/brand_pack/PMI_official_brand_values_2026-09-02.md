# PMI official brand values — full-guide extraction (2026-09-02)

Source: the official "PMI Brand Style Guide - 071525" (Property Management Inc., published
October 11, 2024), read from the guide's own published interior pages at its recorded source
(`https://www.flipsnack.com/C67D66CC5A8/pmi-brand-style-guide-v1-0/full-view.html`, 42 pages).
This supersedes the interior-unavailable limitation recorded in the 2026-06 source-constrained
pack: the guide's interior text is now extracted verbatim, including the exact printed color and
typography specifications the earlier pack marked "not visible in the available source."

Owner ruling 2026-09-02: there is no separate official asset package; the available guide is the
approved brand source for `brand_conformance`.

## Color palette (guide page 30-31, verbatim specifications)

| Color      | RGB           | HEX      | CMYK             | Spot (PMS) |
| ---------- | ------------- | -------- | ---------------- | ---------- |
| PMI Orange | R:255 G:109 B:0 | `ff6d00` | C:0 M:70 Y:100 K:0 | 1505 C     |
| Black      | R:0 G:0 B:0     | `000000` | C:0 M:0 Y:0 K:100  | —          |
| White      | R:255 G:255 B:255 | `ffffff` | C:0 M:70 Y:0 K:0 (as printed) | — |

Tones (page 30): 80% orange may be used minimally for patterns; 20% and 80% black may be used for
patterns, background, font color, and variability. Primary usage: "Orange, black, and white are our
primary colors... Use black or white for generous whitespace. This clean minimalist approach
accents the usage of orange across our brand."

## Typography (guide page 33, verbatim)

- Primary font: **Poppins** ("Use Poppins from Google for all print and digital applications
  whenever possible."). Weights shown: Light, Regular, SemiBold, Bold.
- Body copy: Poppins Light or Poppins Regular; headings/sub-heads: Poppins SemiBold or Bold.
- Alternate font: **Calibri** for Microsoft Office applications.
- Color: "In most cases, color the typography in black when on white or light backgrounds, and
  white when on black or dark backgrounds. Alternatively, but selectively, typography may use
  orange with large or bold fonts."

## Logo and tagline rules (pages 15-29, condensed)

- Primary lock-up: doorway/compass logo symbol + lowercase logotype `pmi.` + positioning tagline
  "the property management people"; vertical (stacked) orientation preferred; stand-alone symbol
  allowed as favicon/support graphic.
- Acceptable color configurations: full color on white/light preferred; all-black or all-white
  alternatives; specified black and PMI-orange background variants.
- Never: rearrange, distort, rotate/flip, recolor outside the palette, add effects, crowd the safe
  area (x-height of the logo symbol), or place on busy backgrounds.
- Tagline is part of the corporate lock-up only; image files, never retyped copy.

## Brand platform (pages 5-13, condensed for copy alignment)

- Purpose "We open doors to a better life"; position "We are the property management people";
  promise "Less worry. More opportunity."; personality Protective, Genuine, Confident, Problem
  Solver.
- Voice: professional-casual; active voice and positive language; avoid jargon; AP style plus the
  Oxford comma; "Use investor, property owner or community (HOA)... resident
  (Residential/Multifamily), or tenant (Commercial)."

## Application to S85 `brand_conformance`

The S85 semantic token architecture stays unchanged; only the brand source layer takes these
official values. PMI Orange `#ff6d00` on white measures ~2.9:1 contrast, below WCAG AA for text,
which matches the guide's own direction that typography is black-on-light / white-on-dark with
orange reserved for selective large/bold accents; accessible derived tones used where orange-as-
text would otherwise fail contrast are an accessibility adaptation, not brand values, and are
labeled as derived in the token source.
