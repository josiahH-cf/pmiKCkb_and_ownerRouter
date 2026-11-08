/**
 * S242 R-S242-4: the one global help version. It appears on the landing page, in every guide
 * header, in every printed footer and in the whole-manual print. A content change ships with a
 * new minor version (V1.1, V1.2) and a changelog entry; a change to a documented process ships
 * with a new major version. `tests/unit/s242-help-version.test.ts` fails when the help content
 * modules change without both.
 */
export const HELP_VERSION = "V2.2";

/** Screenshots for this version live under `public/help/<HELP_VERSION>/<scene>.png`. */
export const HELP_ASSET_ROOT = `/help/${HELP_VERSION}`;

export const HELP_VERSION_PATTERN = /^V[1-9]\d*\.\d+$/;
