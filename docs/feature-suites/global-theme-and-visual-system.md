<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: long-term-ui-ux-v1 -->

# S85 — Global semantic theme and visual-system foundation

> Status: Specified and not implemented. The deployed application is light-only, its PMI color and
> typography values are explicitly provisional, and the existing semantic tokens and UI primitives
> remain the starting truth.

**Goal.**

Give every staff and vendor surface one maintainable, contrast-validated visual language with a
stable Light, Dark, and device-setting theme contract, while preserving functional status meaning,
route authority, and existing workflow behavior.

**Current state / intended end state.**

The root layout loads one light `:root` palette. No theme preference, pre-paint theme activation,
dark palette, `color-scheme`, forced-colors contract, or theme test exists. The token file also owns
component/layout rules; existing surfaces retain many literal colors and duplicated selectors; three
referenced variables are undefined; generic white control borders can be the only 1.23:1 boundary;
and the standalone global-error boundary has a separate light-only inline palette. The shared
`Button` exposes only primary/secondary variants, while other visual classes bypass the primitive
layer. The brand pack establishes black/orange/white identity but supplies no official color values,
font, icon set, or supporting brand color.

The intended application has one semantic token contract for surfaces, text, borders, actions,
focus, elevation, motion, and functional states. It renders a correct theme before content is shown,
lets the user choose `Use device setting`, `Light`, or `Dark`, and follows device changes only while
the device setting is selected. Every first-party surface, including public/vendor pages and the
global error boundary, is legible and structurally consistent in both themes. Functional green,
amber, red, purple, and neutral treatments keep their meanings; orange remains an action/brand
accent, not a success signal. No value is described as official PMI branding until official assets
are supplied and separately reviewed.

**Actors and entry conditions.**

- Every anonymous vendor/setup visitor and every authenticated staff/vendor user receives the same
  theme machinery; theme selection never depends on a role, Space, capability, or provider.
- The initial setting is `Use device setting`. A valid saved device preference overrides that
  default; a missing, malformed, or unsupported saved value behaves as `Use device setting`.
- The preference is non-sensitive, device-local presentation state. It is not synchronized to the
  user profile, stored in Firestore, or treated as evidence of identity or authority.
- Theme activation must not delay, bypass, or obscure session checks, environment labels, source
  warnings, permissions, blocked states, exact confirmations, or error recovery.

**What it is / how it functions.**

### Semantic theme contract

Maintain one versioned theme manifest with exactly three user settings:

| Setting              | Resolved palette | Change behavior                                                                      |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `Use device setting` | Light or Dark    | Resolves from `prefers-color-scheme`; updates when the device preference changes.    |
| `Light`              | Light            | Remains Light until the user changes the setting; device changes do not override it. |
| `Dark`               | Dark             | Remains Dark until the user changes the setting; device changes do not override it.  |

Persist the setting under the namespaced key `pmi.ui.theme.v1` in local storage. Accepted values are
only `system`, `light`, and `dark`. A synchronous constant bootstrap in the root `<head>`—containing no
server/user data—reads and validates that key, resolves `system` with
`matchMedia("(prefers-color-scheme: dark)")`, and sets exact root attributes
`data-theme="light|dark"` and `data-theme-setting="system|light|dark"` before paint. The root layout
uses the framework's root-only hydration-warning escape for these bootstrap-owned attributes; the
hydrated controller initializes from them rather than resetting them. Native `color-scheme` follows
`data-theme`. Root CSS defaults to the Light tokens and a no-JavaScript
`@media (prefers-color-scheme: dark)` fallback supplies the Dark tokens when no explicit attribute is
available. Storage denial/corruption is a recoverable `system` fallback. No network, identity, or
dynamic inline content participates in resolution, and cold-load browser checks must show no visible
wrong-theme frame.

Add a compact `Appearance` disclosure to authenticated AppShell after Notifications and before the
role/sign-out utilities. It also appears in the page chrome for exactly `/sign-in`, `/vendor/setup`,
`/vendor/sign-in`, `/vendor`, and `/vendor/tickets/[ticketId]`. S85 adds only this chrome slot; S87 owns
vendor identity/sign-out shell behavior. S84's desktop and narrow navigation presentations consume
the unchanged utility. S85 owns the complete local disclosure behavior; S86 is not a prerequisite.
The trigger is a native button with `aria-expanded` and `aria-controls`, and the panel exposes the
three settings as one labelled radio group. Opening moves focus to the checked radio. Pointer/touch,
Arrow keys, and Space or Enter can select a setting; selection applies immediately and the panel stays
open so Arrow-key exploration is not interrupted. Escape or reactivating the trigger closes and
returns focus to the trigger. An outside pointer activation or deliberate focus move closes without
stealing focus from the new target. The trigger and group show the current choice with text and a
non-color marker. S85 publishes an optional close/register adapter that S86 later consumes only for
cross-family mutual exclusion with Notifications and navigation; absence of that coordinator never
changes local keyboard, touch, dismissal, or focus behavior. If the root layout cannot render,
`global-error` uses self-contained inline Light/Dark variables plus `prefers-color-scheme`; it cannot
depend on root styles, storage, or the controller and never writes a preference.

### Token roles and theme boundaries

Separate brand source tokens, semantic tokens, and component/layout rules. Components consume
semantic roles rather than palette names or literals. The minimum complete role set covers:

- canvas, primary surface, raised surface, recessed surface, overlay, and scrim;
- primary text, secondary text, placeholder text, inverse text, and disabled text;
- default, strong, interactive, error, and forced-color control boundaries;
- primary action, primary action hover/active, secondary action, tertiary action/link, focus, and
  selected/current treatments;
- success/verified, caution/waiting/needs-verification, error/blocked/destructive, neutral/unset, and
  reference/read-only text, icon, border, and surface pairs;
- radius, spacing, target size, typography, elevation, transition, and reduced-motion behavior.

The current source layer contains exactly six provisional `--pmi-*` tokens. This inventory is
exhaustive and none is an official PMI value:

| Current source token   | Current provisional definition | Exact S85 disposition                                                                                                                                                                  |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--pmi-black`          | `#141414`                      | Retain as the replaceable black source; migrate direct component use to `--brand-hero-surface` or `--topbar-surface` according to the owning surface.                                  |
| `--pmi-white`          | `#ffffff`                      | Retain as the replaceable white source; migrate direct component use to `--brand-on-hero`, `--topbar-text`, `--ui-surface`, or the applicable action foreground.                       |
| `--pmi-orange`         | `#c2410c`                      | Retain as the replaceable orange source; migrate direct component use to `--action-primary`, `--ui-focus`, or the exact link role.                                                     |
| `--pmi-orange-bright`  | `#ea580c`                      | Transitional derived source alias; migrate topbar badges/accents to `--topbar-accent` and focus use to `--ui-focus`, then delete after its source-usage count reaches zero.            |
| `--pmi-orange-100`     | `#fdece2`                      | Transitional derived source alias; migrate each use to `--ui-selected-surface` or `--nav-operations-tile` according to context, then delete after its source-usage count reaches zero. |
| `--pmi-orange-on-dark` | `var(--pmi-orange-bright)`     | Transitional derived source alias; migrate wordmark/tagline use to `--topbar-accent`, then delete after its source-usage count reaches zero.                                           |

All themeable components consume the semantic names below. A later approved brand package replaces
the three retained black/white/orange sources, explicitly disposes of any derived aliases still
present, and revalidates every dependent pair; it cannot bypass contrast gates. The following values
are the exact provisional implementation baseline and accessible product choices, not official PMI
values. The table records resolved values; the manifest itself references the retained source token
where a role intentionally depends on black, white, or orange and records that dependency for later
brand replacement and pair revalidation.

| Semantic role(s)                                                                                                                               | Light value(s)                                                            | Dark value(s)                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `--ui-canvas` / `--ui-surface` / `--ui-surface-raised`                                                                                         | `#f5f5f4` / `#ffffff` / `#ffffff`                                         | `#09090b` / `#18181b` / `#27272a`                             |
| `--ui-surface-recessed` / `--ui-overlay` / `--ui-scrim`                                                                                        | `#f1f5f9` / `#ffffff` / `rgb(15 23 42 / 0.48)`                            | `#111113` / `#27272a` / `rgb(0 0 0 / 0.72)`                   |
| `--ui-text` / `--ui-text-muted` / `--ui-text-placeholder`                                                                                      | `#171717` / `#475569` / `#475569`                                         | `#f8fafc` / `#cbd5e1` / `#a1a1aa`                             |
| `--ui-text-inverse` / `--ui-text-disabled` / `--field-required-text`                                                                           | `#ffffff` / `#475569` / `#9f1239`                                         | `#171717` / `#a1a1aa` / `#fda4af`                             |
| `--ui-border` / `--ui-border-strong` / `--ui-border-subtle`                                                                                    | `#64748b` / `#334155` / `#cbd5e1`                                         | `#a1a1aa` / `#e2e8f0` / `#52525b`                             |
| `--ui-border-interactive` / `--ui-border-error` / `--ui-border-forced`                                                                         | `#c2410c` / `#9f1239` / `#334155`                                         | `#fb923c` / `#fda4af` / `#e2e8f0`                             |
| `--action-primary` / `--action-primary-hover` / `--action-primary-active` / `--action-primary-foreground`                                      | `#c2410c` / `#9a3412` / `#7c2d12` / `#ffffff`                             | `#fb923c` / `#fdba74` / `#fed7aa` / `#171717`                 |
| `--action-secondary-fill` / `--action-secondary-hover` / `--action-secondary-active` / `--action-secondary-text` / `--action-secondary-border` | `transparent` / `#f1f5f9` / `#e2e8f0` / `#171717` / `#64748b`             | `transparent` / `#27272a` / `#3f3f46` / `#f8fafc` / `#a1a1aa` |
| `--action-tertiary-fill` / `--action-tertiary-hover` / `--action-tertiary-active` / `--action-tertiary-text`                                   | `transparent` / `#ffedd5` / `#f1f5f9` / `#9a3412`                         | `transparent` / `#431407` / `#111113` / `#fdba74`             |
| `--action-destructive` / `--action-destructive-hover` / `--action-destructive-active` / `--action-destructive-foreground`                      | `#9f1239` / `#881337` / `#4c0519` / `#ffffff`                             | `#fda4af` / `#fb7185` / `#f43f5e` / `#171717`                 |
| `--action-disabled-fill` / `--action-disabled-text` / `--action-disabled-border`                                                               | `#e2e8f0` / `#475569` / `#64748b`                                         | `#27272a` / `#cbd5e1` / `#a1a1aa`                             |
| `--action-link` / `--action-link-hover`                                                                                                        | `#9a3412` / `#7c2d12`                                                     | `#fdba74` / `#fed7aa`                                         |
| `--ui-focus` / `--ui-selected-surface` / `--ui-selected-text`                                                                                  | `#c2410c` / `#ffedd5` / `#9a3412`                                         | `#fb923c` / `#431407` / `#fed7aa`                             |
| `--state-verified-text` / `--state-verified-surface`                                                                                           | `#166534` / `#f0fdf4`                                                     | `#86efac` / `#052e16`                                         |
| `--state-caution-text` / `--state-caution-surface`                                                                                             | `#92400e` / `#fffbeb`                                                     | `#fde68a` / `#422006`                                         |
| `--state-error-text` / `--state-error-surface`                                                                                                 | `#9f1239` / `#fff1f2`                                                     | `#fda4af` / `#4c0519`                                         |
| `--state-reference-text` / `--state-reference-surface`                                                                                         | `#6d28d9` / `#f5f3ff`                                                     | `#c4b5fd` / `#2e1065`                                         |
| `--state-neutral-text` / `--state-neutral-surface`                                                                                             | `#334155` / `#f1f5f9`                                                     | `#e2e8f0` / `#27272a`                                         |
| `--nav-work-tile` / `--nav-work-icon`                                                                                                          | `#e2e8f0` / `#171717`                                                     | `#3f3f46` / `#f8fafc`                                         |
| `--nav-operations-tile` / `--nav-operations-icon`                                                                                              | `#ffedd5` / `#9a3412`                                                     | `#431407` / `#fdba74`                                         |
| `--nav-admin-tile` / `--nav-admin-icon`                                                                                                        | `#171717` / `#ffffff`                                                     | `#f8fafc` / `#171717`                                         |
| `--topbar-surface` / `--topbar-text` / `--topbar-accent`                                                                                       | `#171717` / `#ffffff` / `#fb923c`                                         | `#050505` / `#ffffff` / `#fb923c`                             |
| `--brand-hero-surface` / `--brand-on-hero`                                                                                                     | `#171717` / `#ffffff`                                                     | `#050505` / `#ffffff`                                         |
| `--elevation-none` / `--elevation-raised`                                                                                                      | `none` / `0 1px 2px rgb(15 23 42 / 0.12), 0 1px 3px rgb(15 23 42 / 0.10)` | `none` / `0 0 0 1px #52525b, 0 8px 24px rgb(0 0 0 / 0.48)`    |
| `--elevation-overlay`                                                                                                                          | `0 18px 38px rgb(15 23 42 / 0.20)`                                        | `0 0 0 1px #71717a, 0 18px 38px rgb(0 0 0 / 0.72)`            |

`--ui-border-subtle` is decorative only and cannot be the sole boundary of an input, button,
selected row, or focus state. Unrounded calculations exceed 5.178:1 for white on the Light primary
action, 7.921:1 for dark text on the Dark primary action, 6.376:1 for every selected text/surface pair,
and 6.477:1 for every listed functional-state text/surface pair. The weakest destructive
foreground/fill pair exceeds 4.882:1, the weakest disabled action text/fill pair exceeds 6.146:1, and
the weakest listed interactive/error/forced boundary against its permitted adjacent canvas or
surface exceeds 4.746:1. Generic placeholder and disabled text may render only on `--ui-canvas`,
`--ui-surface`, `--ui-surface-raised`, or `--ui-surface-recessed`; the weakest such pair exceeds
5.811:1. A state surface uses its state
foreground, and a disabled action uses the dedicated action-disabled triplet rather than generic
disabled text or opacity. Automated checks recalculate the unrounded values from committed tokens;
the table is not a substitute for rendered-state testing.
For each `--state-<name>-text/surface` pair, `--state-<name>-icon` and
`--state-<name>-border` resolve to that pair's text value; components do not invent a third hue.
Required markers and validation copy use the independently declared `--field-required-text`, always
with their existing non-color/ARIA cue; they never alias a source-status token even when the exact
provisional values happen to match.

Secondary actions are outlined: resting fill is transparent, text and the explicit secondary border
remain visible, and hover/active add only the listed neutral surfaces. Destructive actions use the
complete destructive action quartet rather than functional-status surfaces. Native disabled controls
keep their disabled property, use the dedicated disabled triplet at full opacity, suppress hover and
active styling, and expose any unavailable reason in visible text or `aria-describedby`; color and a
cursor change are never the only disabled cues.

Outside forced-colors mode, `--ui-border-forced` is the validated fallback for a control that would
otherwise lose its only boundary. Under `@media (forced-colors: active)`, it resolves to the system
color `ButtonBorder`, interactive/focus boundaries resolve to `Highlight`, and error boundaries use
`CanvasText` plus their visible error label; no hard-coded Light or Dark value overrides the user's
system palette. Raised and overlay elevations are enhancement only. A raised/overlay control or
surface that needs an identifiable edge also renders `--ui-border`; forced colors may remove every
shadow without removing that edge.

The initial compatibility map is exhaustive for the current themeable legacy-token layer apart from
the separately inventoried `--pmi-*` sources and separately owned typography, spacing, radius, and
field-size tokens:

| Existing alias                                             | Transitional semantic target or exact disposition                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--color-bg`                                               | `--ui-surface`                                                                                                                                                                                               |
| `--color-surface`                                          | `--ui-canvas`                                                                                                                                                                                                |
| `--color-border`                                           | `--ui-border`                                                                                                                                                                                                |
| `--color-text`                                             | `--ui-text`                                                                                                                                                                                                  |
| `--color-text-muted`                                       | `--ui-text-muted`                                                                                                                                                                                            |
| `--color-primary-900`                                      | `--topbar-surface`                                                                                                                                                                                           |
| `--color-primary-700`                                      | No safe global target: split each current use atomically among `--action-primary`, `--action-secondary-text`, `--action-secondary-border`, `--action-link`, and `--ui-border-strong`, then delete the alias. |
| `--color-primary-500`                                      | `--ui-border-strong`                                                                                                                                                                                         |
| `--color-primary-100`                                      | `--ui-selected-surface`                                                                                                                                                                                      |
| `--color-accent-700` / `--color-accent-500`                | `--action-primary`                                                                                                                                                                                           |
| `--color-accent-100`                                       | `--ui-selected-surface`                                                                                                                                                                                      |
| `--state-verified` / `--status-connected`                  | `--state-verified-text`                                                                                                                                                                                      |
| `--state-partial` / `--state-conflict` / `--status-action` | `--state-caution-text`                                                                                                                                                                                       |
| `--state-placeholder` / `--status-none`                    | `--state-neutral-text`                                                                                                                                                                                       |
| `--state-no-source`                                        | `--state-error-text`                                                                                                                                                                                         |
| `--color-required`                                         | `--field-required-text`                                                                                                                                                                                      |
| `--state-reference`                                        | `--state-reference-text`                                                                                                                                                                                     |
| `--shadow-floating`                                        | `--elevation-overlay`                                                                                                                                                                                        |

The six `--pmi-*` source tokens follow the explicit source-manifest dispositions above; they are not
silently omitted from the migration ledger. Typography, spacing, radius, and field-size tokens remain
separately owned. `--font-size-sm`, `--color-bg-subtle`, and `--color-primary` are used but currently
undefined; they must be replaced at each use with the exact semantic role rather than added to this
map. Every source-manifest disposition and compatibility row gets a source-usage count, owning cohort,
and deletion/retention assertion. Adding another transitional visual alias fails the token-graph
check. The mixed-purpose `--color-primary-700` retains its current value only until all of its uses in
an owning cohort are changed in the same patch; it is never rebound globally to a semantic role.

The Light and Dark palettes assign values to every semantic role. Dark mode is not an inversion:
canvas, raised surfaces, recessed surfaces, borders, and overlays retain visible depth; muted text
remains readable; inputs remain distinct from their parent surface; orange actions retain sufficient
contrast; and functional state surfaces do not become saturated or indistinguishable. Status meaning
always includes text and, where useful, icon/shape. No semantic token may silently change from one
meaning to another between themes.

Use current functional state hues as the compatibility basis, but retune theme-specific foreground
and surface pairs where contrast requires it. Do not introduce a supporting _brand_ color without an
approved brand source. Neutral grays and the existing functional state colors are allowed as
semantic UI colors and must not be presented as PMI brand assets.

### Contrast and non-color contract

- Normal text and text rendered in controls meets at least 4.5:1 against every reachable background.
  `Large text` means at least 18-point/24-CSS-pixel regular or 14-point/about-18.67-CSS-pixel bold and
  meets at least 3:1. Ratio computation uses unrounded relative luminance; displayed decimals never
  round a failing pair into a pass.
- Focus indicators, control boundaries when required to identify a control, status icons, selected
  markers, and other essential non-text UI meet at least 3:1 against adjacent colors.
- Link, hover, current, selected, blocked, verified, and disabled states never rely on hue alone.
- The committed weak generic control boundary and below-threshold done-step pairing are replaced by
  role pairs that pass their applicable thresholds in both themes.
- `forced-colors` leaves `forced-color-adjust: auto` by default, uses native elements or explicit
  system-color borders/outlines where backgrounds/shadows disappear, keeps SVGs on `currentColor`,
  and preserves text/shape selected and status cues; no background image or transparent border is
  the only state cue.
- `prefers-reduced-motion` continues to collapse nonessential transitions and stops indeterminate
  animation without hiding its visible busy label.

Contrast checks enumerate every distinct semantic foreground/background pair and every essential UI
element/adjacent-color pair in both themes; each must have at least one rendered component/state
instance. They use computed rendered values, not comments or token names. The currently stale contrast
approximation in token comments is corrected when the source layer is edited. Print always uses a
light semantic print palette with black text and non-color state labels; printing does not change the
saved Appearance setting.

### Component migration and compatibility

Consolidate shared visual behavior into the existing `components/ui` layer rather than adding a
second design system. S85 themes existing primitives and supplies semantic colors. S86 owns creation
and behavioral migration of Action, Icon/IconButton, InfoTip, Progress, Notice, and Dialog primitives,
including consistent view box/stroke, `currentColor`, decorative labelling, and forced-color behavior.
S84 owns only its nine destination icon keys/glyph choices and consumes S86's Icon primitive.

Migrate in bounded cohorts:

1. root canvas, typography, topbar, Appearance control, global error, public authentication, and the
   current vendor page wrappers;
2. shared controls, links, fields, tables, cards, dialogs, disclosures, tabs, status treatments, and
   feedback primitives;
3. Dashboard/My Work/Internal Processes and process/run surfaces;
4. Renewals, Maintenance, Communications/Notifications, Connections, Approval Queue, and Admin;
5. final cross-cohort regression and removal of the enumerated compatibility aliases.

Each cohort includes its own material empty, error, permission, degraded, long-content, and responsive
states; those states are not deferred to cohort 5. Repair undefined variables and conflicting duplicate
selectors before forbidding new literals. Before implementation, enumerate every required legacy
class/token alias in the migration ledger with old name, new semantic role, owning cohort, and deletion
check. No unlisted alias is introduced, and each listed alias is removed when that cohort passes. Do
not perform an unbounded stylesheet rewrite.

### Appearance failure and recovery

- If local storage is unavailable, the UI remains fully usable in device mode for the current page
  and explains the non-persistence only after the user tries to change Appearance.
- If a stored value is invalid, ignore and replace it with `system` on the next successful write.
- If JavaScript has not hydrated, server-rendered content remains legible and native controls use a
  device-compatible scheme; Appearance becomes interactive after hydration without moving focus.
- If a theme token is missing, a deterministic build/test gate fails. Do not silently fall back to a
  literal that can hide a contrast defect.
- Changing theme never clears form input, filters, route state, pending work, or reviewer decisions.

**In scope / out of scope.**

In scope: Light/Dark/system choice; device-local persistence and pre-paint resolution; semantic
tokens; existing primitive visual variants; Appearance placement; dark-safe global error/public/
vendor/authenticated surfaces; contrast, forced-color, reduced-motion, responsive, zoom, and visual
regression gates; staged removal of themeable literals, undefined variables, and duplicate style
rules.

Out of scope: official PMI color/font/logo invention; a new supporting brand color; account-synced
preferences; user-profile or Firestore changes; route/role/provider/workflow behavior; content
removal; action-key changes; third-party theme/icon packages; marketing-site redesign; autonomous
effects; or changing what any functional status means.

**Open questions & assumptions.**

- Decision: the recommended default is `Use device setting`, with explicit Light and Dark choices.
  This supports dark mode without surprising users who have already expressed a device preference.
- Decision: appearance is device-local and anonymous-safe. Cross-device synchronization would add an
  identity/data contract with no supplied need and is therefore excluded.
- Decision: S84's destination title/subtext remains visible inside an opened navigation panel; it is
  concise wayfinding content, not removable page exposition. S87 governs other persistent copy.
- Assumption: official PMI visual values remain unavailable. Existing values stay explicitly
  provisional until a separately reviewed asset package replaces only the brand source layer.

**Cross-product impacts.**

Root layout and global-error rendering; global styles and token ownership; shared UI primitives;
AppShell and S84 topbar composition; public/vendor authentication and portal shells; every staff
product lane; snapshot/contrast/accessibility tests; brand documentation. No store, provider, action
registry, route guard, or external effect changes.

**Authority and evidence map.**

| Input                                                                                                                                                                                                                                                                                                                        | Classification                   | Use and limitation                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Router, committed layout/styles/components/tests, `docs/facts.md`                                                                                                                                                                                                                                                            | Authority / implementation truth | Establish current light-only plumbing, provisional tokens, workflow boundaries, and behaviors that must be preserved.                   |
| `docs/brand_pack/PMI_app_brand_pack_llm_context.md`                                                                                                                                                                                                                                                                          | Verified visual-source boundary  | Supports black/orange/white identity and explicitly withholds official values, font, icon, and motion claims.                           |
| 2026-08-31 long-term UI/UX note and `docs/evidence/ui-ux-audit-2026-08-31.html`                                                                                                                                                                                                                                              | Intent and audit evidence        | Require dark mode, clear branding, and global consistency; reviewer decisions do not authorize implementation.                          |
| [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color), [non-text contrast](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html), and [CSS Color Adjustment](https://www.w3.org/TR/css-color-adjust-1/) | External standards evidence      | Define measurable contrast, non-color, forced-color, and `color-scheme` expectations; do not supply PMI values.                         |
| Official PMI digital asset package                                                                                                                                                                                                                                                                                           | External release dependency      | Absence does not block the accessible technical foundation, but `brand_conformance` and final production-brand sign-off remain blocked. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S85-1** — One validated theme manifest resolves `system|light|dark` to a complete Light or
  Dark semantic token set before paint; unit/hydration checks fail against the current root-only
  palette and pass without a network or identity dependency.
- **ARCH-S85-2** — One semantic token graph separates brand sources, functional roles, and
  component/layout rules; static checks reject missing variables, cycles, newly introduced
  themeable literals, and theme-specific meaning drift.
- **ARCH-S85-3** — One device-local Appearance controller owns persistence, device-change handling,
  root attributes, native `color-scheme`, and topbar/public presentation; actor and route matrices
  prove the same settings without role leakage.
- **ARCH-S85-4** — A migration ledger covers every shared primitive and all 29 audited experiences
  in both themes and material states; each cohort has explicit compatibility and deletion gates.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S85-1** — A first visit follows the device palette; explicit Light or Dark survives refresh;
  system mode follows a later device change; invalid or denied storage safely falls back to system.
- **BEH-S85-2** — Appearance is keyboard/touch operable, announces the selected setting, closes and
  returns focus predictably, and never alters route, data, permission, or workflow state.
- **BEH-S85-3** — Every audited surface/state remains readable and structurally distinguishable in
  both themes, at 320 CSS pixels and 200-percent zoom, with reduced motion and forced colors.
- **BEH-S85-4** — Brand actions, ordinary links, functional statuses, focus, disabled, and selected
  states have stable non-color meaning and pass computed contrast thresholds in both themes.

**Human litmus outcome.**

### Choose a comfortable appearance without losing work

**If this was built correctly:** A user opens Appearance, chooses Dark, and continues the current
task without navigation or loss of the currently mounted input, filter, dialog, or focus context.
After a separate refresh, Dark is selected again; ordinary application draft persistence remains
unchanged. Choosing Use device setting follows the device theme. Statuses, links, inputs, focus, and
dialogs are as clear in either palette, and no color suggests that an unfinished check succeeded.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Recognize the product without a fabricated brand claim

**If this was built correctly:** Orange and black create a consistent PMI visual hierarchy, while
success, warning, blocked, and reference colors keep their functional meanings. Documentation and UI
never call a provisional value, font, supporting color, or icon “official PMI.”

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                  | Architecture outcome       | Behavior outcome | Human litmus                    | Deterministic evidence / falsification                                                         |
| -------------------------------------------- | -------------------------- | ---------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| System/Light/Dark resolution and persistence | `ARCH-S85-1`, `ARCH-S85-3` | `BEH-S85-1/2`    | Choose a comfortable appearance | Cold-load, corrupt-storage, denied-storage, refresh, media-change, and no-flash browser tests. |
| Complete semantic theme roles                | `ARCH-S85-2`, `ARCH-S85-4` | `BEH-S85-3/4`    | Both                            | Static token graph plus rendered component/state matrix in both palettes.                      |
| Contrast and non-color meaning               | `ARCH-S85-2/4`             | `BEH-S85-3/4`    | Both                            | Computed contrast, forced-colors, status-label, focus, zoom, and reduced-motion checks.        |
| Universal Appearance control                 | `ARCH-S85-3`               | `BEH-S85-1/2`    | Choose a comfortable appearance | Staff/vendor/public actor, keyboard, touch, focus-return, and topbar composition tests.        |
| No invented official visual asset            | `ARCH-S85-2`               | `BEH-S85-4`      | Recognize the product           | Literal/source-token audit and documentation assertion against the verified brand boundary.    |
| Bounded all-surface migration                | `ARCH-S85-4`               | `BEH-S85-3`      | Both                            | 29-experience ledger; each cohort must pass before compatibility aliases are deleted.          |

**Preservation set.**

Keep current server route guards and role/Space filtering; AppShell environment, notification,
role, sign-out, and session behavior; S72/S75/S78/S80 renewal truth; S81/S83 connection/access truth;
S84 navigation semantics; Field/Tabs/Stepper/Disclosure semantics; global visible focus; reduced
motion; functional status labels; exact confirmation and live-effect gates; public/vendor auth;
responsive containment; no-secrets/PII checks. Theme results are a separate gate and never average
away a preservation failure.

**Adversarial acceptance checks.**

- **AC-S85-1** — `ARCH-S85-1/3` rejects unknown stored values, storage exceptions, hydration race,
  stale device listeners, and a visible wrong-theme first frame; all three settings produce exact
  root attributes and native scheme.
- **AC-S85-2** — `ARCH-S85-2` rejects every undefined variable, new themeable literal outside the
  allow-listed brand-source/global-error bootstrap boundary, and a missing Light/Dark role.
- **AC-S85-3** — `BEH-S85-3/4` measures every distinct semantic text/surface and essential UI/
  adjacent-color pair in both themes and renders every component/state pairing at least once,
  including the current weak border and done-step cases; hue-only fixtures fail.
- **AC-S85-4** — Appearance works with pointer, touch, Tab, arrows/radios, Enter/Space, Escape, and
  outside interaction at desktop, 760px, 320px, and 200-percent zoom; focus never disappears.
- **AC-S85-5** — A pending form, desk filter, open dialog, or unsaved local input survives a theme
  change; provider/store/action spies remain at zero.
- **AC-S85-6** — Forced colors and reduced motion preserve labels, focus, boundaries, and busy/status
  meaning without relying on a transition, shadow, background image, or color alone.
- **AC-S85-7** — Global error, anonymous sign-in/setup, vendor portal, authenticated shell, and print
  output remain legible when ordinary app styles or storage are unavailable.

**Forbidden actions / hard gates.**

Do not invent or label official PMI values/assets; add a remote icon/font/theme dependency; persist
appearance in user or provider data; weaken route/action/source gates; alter a functional status;
hide environment/source/safety meaning; send a client message; write to RentVine or the operating
Sheet; alter protected auth/action-gate/budget paths; or treat a screenshot alone as accessibility
certification.

**Dependencies / sequencing.**

Implement S85 in full before broad S86/S87 surface migration. S85 owns root resolution, semantic
roles, Appearance selection, and all local Appearance disclosure/keyboard/touch/dismissal/focus
behavior; it has no S86 prerequisite. S86 later consumes S85's semantic roles and optional
Appearance close/register adapter to add cross-family transient-layer coordination without replacing
or weakening S85 behavior. S83 remains before S84 and S82 for their access handoffs. S84 consumes
S85's Appearance utility and semantic icon/tone roles plus S86's later coordinator, but retains its
own within-navbar disclosure contract. S82/S83 consume the theme roles without changing source/action
truth. Official brand assets remain a release dependency for brand conformance even though technical
theme work can proceed.

**Standalone delivery contract.**

- **Deliverable now:** complete theme resolver, Appearance control, semantic Light/Dark tokens,
  theme migration for existing primitives, bounded 29-experience ledger, contrast/accessibility/visual
  checks, and safe system fallback can reach `ALL_GATES_GREEN` without external brand
  assets.
- **Does not consume downstream suites:** S85 publishes semantic roles, the complete standalone
  Appearance behavior, and its optional coordinator adapter for later S86/S84 consumption. Until
  downstream components exist, current shell/controls consume only the enumerated compatibility
  aliases; their absence cannot block S85's technical result.
- **Externally blocked release check:** `brand_conformance` and final production-brand sign-off are blocked
  on an approved PMI color/logo/type asset package plus contrast revalidation. The technical
  `ALL_GATES_GREEN` implementation result may be reported alongside `brand_conformance: BLOCKED`;
  it cannot claim official-brand accuracy or treat that separate sign-off as an implementation
  terminal state.
- **Produces for downstream suites:** resolved-theme contract, semantic tokens, Appearance utility,
  icon/tone compatibility, rendered theme matrix, and literal/contrast gates.

**Verification and delivery contract.**

1. Freeze the current light render, source/state labels, AppShell utilities, and 29-experience
   migration inventory; add fail-first resolver, no-flash, token-completeness, contrast, and theme
   accessibility checks before implementation edits.
2. Implement and verify root resolution, shared tokens, and theme variants for existing primitives
   first, then migrate one bounded cohort at a time. Do not delete a literal/alias until that cohort's
   Light/Dark/state matrix passes.
3. Exercise Chromium in Light, Dark, and system modes at desktop, 760px, 320px, and 200-percent zoom;
   cover keyboard, touch emulation, forced colors where supported, reduced motion, long content,
   loading/error/empty/disabled states, print, and the global-error fallback.
4. Run focused tests and `bash scripts/verify.sh`; inspect the diff and audit brand claims, literals,
   secrets, PII, route/action gates, runtime configuration, and scope before authorized delivery.
5. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. Report `brand_conformance: BLOCKED` separately
   until the approved asset package and contrast revalidation exist.

**Ordered prompt sequence.**

1. Re-verify token/style/layout/component inventory and official-brand evidence boundary.
2. Materialize fail-first theme, persistence, token-graph, contrast, visual-state, and preservation
   checks.
3. Build root resolution, semantic tokens, Appearance, and shared visual variants.
4. Migrate the five cohorts in order, preserving separate rollback points and evidence.
5. Falsify both themes and all stated states, run canonical verification, and update current docs.

**Deletion/merge recommendation.**

Remove S85 when every audited surface is represented in the Light/Dark/state ledger, obsolete
aliases/literals are removed, all acceptance and preservation gates are current, official
`brand_conformance` is either verified or carried by a separate active contract, and the resulting
theme/visual contracts are owned by code, tests, and verified present-fact documentation.
