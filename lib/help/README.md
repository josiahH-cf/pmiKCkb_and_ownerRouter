# Staff help hub content

The `/help` section of the app is the staff manual. Its content is repository-managed source that
ships with an ordinary release (S242, S243, S244). There is no in-app editor and no Firestore
collection; reading, navigating and printing help write nothing and call no provider.

## Layout

- `types.ts` is the content model: guide, step, screen reference, glossary term, changelog entry.
- `sections.ts` is the table of contents order. The sidebar shows Start here (the landing page),
  these areas, then Reference, Glossary and What changed.
- `content/guides/<section>.ts` holds the process guides of one area; `content/screens/*.ts` holds
  one screen reference per staff route; `content/glossary.ts` and `content/changelog.ts` hold the
  glossary and What changed.
- `content/scenes.json` is the scene manifest: one entry per screenshot with its guide step, route,
  local demo role, synthetic fixture state, viewport, framed region and capture source.
- `content/renewal-control-map.json` is the renewal step-to-control map that the rehearsal
  guide-control smoke and the S115, S120 and S132 tests read.
- `guide-links.ts` maps every renewal About panel and InfoTip to the guide step its "Open the
  guide" link opens; `copy-disposition/*.json` is the S244 disposition table for every in-app help
  text.

## Writing a guide

1. Write numbered steps in the order a person works: an action sentence, the exact control
   (label, semantic role, region, availability and the source file that renders the label), the
   route, where it is on the page, the expected result and the step's effect.
2. Copy every control label from the interface. When a label is composed at runtime, add
   `sourceText` with the literal template from the source.
3. End with "What this does not do" lines in the present tense.
4. Describe only what exists and works today. Closed gates are present behavior: say what the
   screen shows and what the person does next. Never name a client decision, a hold, a person or a
   customer value. No em dash.

## Versioning

`HELP_VERSION` (`version.ts`) is one global version shown on the landing page, every guide header
and every printed footer. Any change under `content/` needs a new minor version (V1.1, V1.2) and a
changelog entry at the top of `content/changelog.ts` with the new content digest
(`npm run help:digest`); a change to a documented process needs a new major version. The version
test fails otherwise. Screenshots live in `public/help/<HELP_VERSION>/`, so a version change also
re-captures them.

## Screenshots

`npm run help:capture` (`scripts/run-help-rehearsal.sh`) starts the isolated synthetic rehearsal
at the committed HEAD (Firestore emulator, synthetic RentVine and Google stand-ins, every other
outbound connection refused), seeds the fixtures in `scripts/lib/help-rehearsal-fixtures.mjs`,
signs in with each scene's local demo role and writes `public/help/<HELP_VERSION>/<scene>.png`.
`npm run help:capture:check` resolves every scene without writing. A scene the rehearsal cannot
show may use a production capture only after a real fixture attempt: taken read-only through the
approved Admin session, blurred (names, addresses, email addresses, amounts and identifiers) before
it enters the tree, inspected by eye and recorded as `production-blurred` with its reason, date and
attestation. No unblurred production capture is ever committed.

## Gates

`bash scripts/verify.sh` runs `verify:help-coverage` (every staff route, navigation item, directory
Space and About id is documented; exclusions in `coverage-allow-list.ts` need a reason),
`verify:help-controls` (every named control matches its source label), `verify:help-screenshots`
(every referenced picture exists, is manifested and is referenced) and `verify:help-content` (no em
dash, jargon, roadmap or hold language). `bash scripts/run-help-rehearsal.sh --controls` checks
every control by role and exact accessible name on the real pages.

Required local verification and the E2E CI lane run the rendered control and scene gate.

```sh
npm run verify:help-rendered
```

Use the lockfile-pinned Chromium and a clean commit. The rehearsal holds automatic comparison and
uses an isolated Firestore emulator, synthetic fixture dates, and a browser restricted to the local
app. Provider-only scenes and conditional controls are reported separately from passing cases.
A material difference saves the expected and observed synthetic images in the private run directory
and fails the gate. The comparison tolerates small color changes from rasterization and checks both
whole-scene and local areas for larger changes. The report names the source and served commits,
the scene and fixture, and the measured difference.

To propose fresh images in private state for review, run the same entry point in capture mode.

```sh
bash scripts/run-renewal-one-path-rehearsal.sh --hold-automatic-comparison --no-mail-adapter --help-rendered --review-captures
```

Review each proposed image and adopt it with its current Help version and wording. Only the
current version stays under `public/help`. The application redirects earlier known image names
to their current asset.
