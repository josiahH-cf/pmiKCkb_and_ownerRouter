<!-- spec-shape: overhaul-v1 -->
<!-- cherry-bridge-notes: N3, N8 -->

# S71 — Lease identity: house numbers in addresses and the right resident

> New 2026-08-24 from the client's "Cherry Bridge Renewal Fixes Needed" notes **N3** ("House numbers in
> the addresses") and **N8** (a resident named on a renewal was not the resident on that lease).
> Grounded against the code: **N8 is most likely the same root cause as N3**, not a separate name bug.
> Specification only — this suite changes no product code until an implementation session picks it up.

**Goal.** Every place the app names a lease, it names one specific unit — house number included — and
the resident shown beside it is verifiably the resident on that lease. Today the label is street-only,
so two leases on one street render identical cards, the operator cannot tell them apart, and a
report that "the tenant name is incorrect" cannot be checked from the screen. The same street-only
label also goes out in the owner's email, which reads as a renewal for a street rather than a home.

**What it is / how it functions.**

_Current state, verified in-repo._ `leaseAddressLabel()` in
`lib/integrations/rentvine/lease-mapper.ts:174` walks
`["streetName", "address", "addressLine1", "propertyAddress"]` first-hit-wins. RentVine's
`property.streetName` is street-**name**-only — the house number lives in `property.streetNumber` — and
`streetName` is present on 305/305 records. Because it is first in the list and always present, it
always wins, and the label is therefore **always** street-only. This is a pure key-**order** defect:
there is no truncation step, no redaction rule, and no missing data. The identical bug is duplicated in
the Gmail owner-draft path at `lib/lease-renewal/execution/renewal-notice-draft-service.ts:314`.

A correct composer already exists in this repository, twice: `unitAddress` in
`lib/console/rentvine-live-provider.ts` and `composeUnitAddress` in `lib/maintenance/unit-matcher.ts`
both read `streetNumber` first and compose it with `streetName` and `address2`. The fix is to stop
maintaining a third, wrong implementation.

_Blast radius beyond cosmetics._ Three real failures follow from the missing number. `matchRenewalTarget`
in `lib/ask/renewal-target.ts` requires a numeric token to resolve a lease, so the Ask box **can never**
resolve a live renewal target from what the UI displays. RentCast comps are queried on an ambiguous
street-only address, so the comparable range is drawn for the wrong block. And the outgoing owner email
literally names a street with no number.

_Resident identity (N8)._ Names resolve from `tenants[0]` only; elements `1..n` are never read and no
primacy or active flag is consulted. There is a matching asymmetry already shipped: recipients fan out
to **every** co-tenant (To first, Cc the rest, per S61) while the greeting names only `tenants[0]`. No
demo or seed contamination exists — the reported names appear nowhere in source, only in gitignored
live-capture artifacts. So the likeliest explanation of "the tenant name is incorrect" is not a name
lookup bug but that the operator could not tell **which lease** they were looking at, because two units
on one street render the same label. Fixing the label is therefore the first diagnostic, not a cosmetic
side quest — and the resident-primacy question is specified separately below so it can be answered
against evidence rather than assumed.

_Intended end state._ One shared address composer produces `"<streetNumber> <streetName><, address2>"`
for every renewal surface — desk card, workspace heading, owner draft, tenant draft, Ask target
matching, and comp lookup. Where a lease has more than one tenant, the surface names the lease's
resident set unambiguously rather than silently picking element zero.

**Open questions & assumptions.**

- **Open — `Q-S71-TENANT-PRIMACY`.** Does RentVine expose a primary/active flag on the tenant array, or
  is `tenants[0]` genuinely the primary? Unknown in-repo. Answered by a read-only discovery pass over
  the live export, emitting a bodyless report of which tenant-level fields exist and how often.
- **Open — `Q-S71-N8-ROOT-CAUSE`.** Whether the client's specific report was an identification failure
  (the S71 label) or a genuine wrong-name lookup. This is only decidable once the label carries a house
  number and the operator re-checks the same lease. Do not build a name-override control before that.
- **Assumption — `A-S71-ADDRESS-SHAPE`.** The operator-facing label is
  `"<streetNumber> <streetName>"`, plus `", <address2>"` when a unit designator exists — matching the
  two composers already in the repo, not a new format.
- **Assumption — `A-S71-NO-NEW-PII-SURFACE`.** Adding the house number does not widen what the app
  displays to any new audience; it corrects an existing label on existing, already-authorized surfaces.

**Cross-product impacts.** S70's sorted queue is only usable if rows are distinguishable, so these two
land together. S28/S59 RentCast comp lookups become correct queries rather than ambiguous ones, which
changes the comparable range an owner sees — expect S60's under-market signal to move for some leases,
and treat that as the fix working, not a regression. S33's Ask-to-action renewal targeting becomes
reachable for the first time. S61's recipient fan-out already handles the multi-tenant case correctly;
this suite brings the greeting into line with it rather than changing the recipient rules. S43's
workspace heading and S25's execution contract both consume the label.

**Adversarial acceptance checks.**

- **AC-S71-1** — for a fixture record carrying both `streetNumber` and `streetName`, the rendered desk
  card label begins with the house number. A fixture whose `streetName` alone would satisfy the old
  first-hit-wins order fails unless the number is present.
- **AC-S71-2** — the desk card, the workspace heading, the owner draft, and the tenant draft render the
  **same** address string for one fixture lease. A change made in one path and not the others fails by
  producing two different strings.
- **AC-S71-3** — exactly one address composer is reachable from the renewal paths. A test asserts the
  duplicated key-order walk in `renewal-notice-draft-service.ts` no longer exists, so the bug cannot be
  fixed in one path and left in the other.
- **AC-S71-4** — two fixture leases on the same street with different house numbers render two
  distinguishable labels, and neither is a prefix of the other in a way that would collide in a list.
- **AC-S71-5** — `matchRenewalTarget` resolves a live renewal target from the address string the UI
  actually displays. A fixture that feeds the rendered label into the Ask matcher succeeds; today's
  street-only label fails it, which is the regression guard.
- **AC-S71-6** — a comp lookup is issued against the composed address including the house number. A
  fixture asserts the outbound query string contains the number.
- **AC-S71-7** — for a fixture lease with two or more tenants, the operator-facing surface names the
  resident set unambiguously rather than rendering only `tenants[0]`, and the greeting's named
  resident(s) are consistent with the recipient set S61 computes for the same lease.
- **AC-S71-8** — the tenant-field discovery report exists, is committed, and is bodyless: field names
  and value counts only, never a resident name, address, or rent.

**Forbidden actions / hard gates.** No autonomous, scheduled, bulk, or model-triggered client-facing
send. No resident name, address, or rent from a live capture may enter a committed spec, test fixture,
report, or evidence file — `golden-data/captured/` and `temp/model-audit-*/out/` are gitignored for
exactly this reason and must never be copied out of. No name-override or manual-correction control may
be built before `Q-S71-N8-ROOT-CAUSE` is answered against a re-check with the corrected label; building
one first papers over a data defect with operator labor. The fix must not introduce a fourth address
composer — it removes one. Recipient computation is S61's contract and is not changed here.

**Ordered prompt sequence.**

1. Extract one shared address composer from the two correct existing implementations.
2. Point `leaseAddressLabel()` at it; delete the first-hit-wins key walk.
3. Point `renewal-notice-draft-service.ts` `addressOf` at the same composer; delete its duplicate walk.
4. Assert one string across desk card, workspace heading, owner draft, tenant draft.
5. Re-verify Ask target matching and the comp lookup query against the corrected label.
6. Read-only tenant-field discovery pass; emit the bodyless report.
7. Only then: bring the greeting's named residents into line with S61's recipient set.
8. Ask the operator to re-check the specific lease from N8 with the corrected label, and record whether
   the name was in fact wrong.

**Deletion/merge recommendation.** Keep as its own suite; it is the highest-leverage single fix in the
Cherry Bridge set because it silently unblocks Ask targeting and comp accuracy in addition to the
cosmetic complaint. Do not merge into S70 — S70 is ordering and cohort, this is identity. Retire
`A-S71-ADDRESS-SHAPE` into `docs/facts.md` once an operator confirms the rendered shape.
