<!-- spec-shape: overhaul-v1 -->
<!-- cherry-bridge-notes: N9 -->

# S74 — Tenant offer copy: editable wording and a channel claim that is only made when it is true

> New 2026-08-24 from the client's "Cherry Bridge Renewal Fixes Needed" note **N9** ("Change this
> message" — the Text channel). Owner decision Q7 = **A**: adopt the team's wording, and render the
> past-tense channel-success clause only when the app has evidence both channels actually went out.
> Specification only — this suite changes no product code until an implementation session picks it up.

**Goal.** The team can change the tenant message themselves, and the message never tells a resident
something the app cannot show happened. The team's requested sentence says the offer "has been sent out
via email and rentvine chat" — a past-tense claim about two channels. They get that exact sentence
whenever it is true, which in practice is whenever they did what they said they did; when it is not
true, the resident sees a truthful variant instead of a claim the software invented.

**What it is / how it functions.**

_Current state, verified in-repo._ All three channels render from **one frozen constant**,
`TENANT_RENEWAL_V1_BASE_COPY` in `lib/lease-renewal/tenant-draft.ts:43`, registered as governed artifact
`tenant-renewal:v1.0` in `lib/gmail-hub/governed-artifacts.ts` with a `contentHash`. Email and Portal
chat are byte-identical; only the Text variant differs.

The requested wording is a **past-tense channel-success claim**, and `AC-S24-4` permits that class of
statement only against real receipts. The receipt mechanism already exists — `channelReceipts` feeding
`bothChannelSuccess` — but **no production caller ever populates it**, and both the portal-chat and SMS
send keys are `production_allowed:false` with a "Vendor-Confirmation-Required" reason. So as written,
the claim cannot be made true by the app today: the app cannot send a RentVine portal message at all,
which means the sentence would be asserted by the software on the strength of nothing.

Two further gaps. The copy is **not editable in-app**: the approved-template store exists but has
exactly one caller (move-in welcome), so every wording change is currently a code deploy. And editing
the constant silently changes the governed artifact's `contentHash` while the artifact keeps claiming
its 2026-07-14 v1.0 approval — `AC-S24-3`'s "modified artifacts fail closed" is **not actually enforced
against an in-repo edit**, which is a live governance hole this suite must close.

_Intended end state._ The tenant renewal copy is an approved, versioned, in-app-editable template with
the team's wording adopted. The channel-success clause is conditional: it renders when recorded receipts
show both channels went out, and renders a truthful variant otherwise. Editing the copy mints a new
artifact version with a new approval rather than silently invalidating an old one.

**Open questions & assumptions.**

- **Open — `Q-S74-TRUTHFUL-VARIANT`.** What should the sentence read when only one channel went out, or
  when the app cannot confirm either? Needs the team's wording, not the model's. Ship a plain default
  and ask them to confirm or replace it.
- **Open — `Q-S74-MANUAL-RECEIPT`.** When a person sends the RentVine chat message by hand — which is
  the only way it happens today — may they record that as a receipt in the app? If yes, the team's exact
  sentence becomes reachable immediately; if no, it stays unreachable until the portal send key opens.
- **Assumption — `A-S74-EDIT-MINTS-VERSION`.** Editing approved copy creates a new version requiring its
  own approval, rather than mutating v1.0 in place.
- **Assumption — `A-S74-TEXT-ONLY-DIVERGENCE`.** The Text variant may keep wording that differs from
  Email and Portal chat, as it does today; this suite does not force all three to converge.

**Cross-product impacts.** S24 owns communications policy and the governed-artifact contract; this suite
closes `AC-S24-3`'s unenforced-edit hole and is the reason for the recorded S24 amendment. S15's Gmail
hub and the approved-template store gain their second real caller, which is the point at which that
store stops being effectively dead code. S43's channel labels must agree with what this copy is rendered
under. S61's recipient fan-out determines who receives it. S25's execution contract carries the draft.
D33's permanent closure of the renewal send keys is why the portal channel cannot be proven by the app
today, and why `Q-S74-MANUAL-RECEIPT` matters.

**Adversarial acceptance checks.**

- **AC-S74-1** — with recorded receipts showing both email and portal chat went out, the rendered Text
  message contains the team's exact requested clause.
- **AC-S74-2** — with no receipts, or receipts for only one channel, the rendered message does **not**
  contain the past-tense both-channel clause and instead renders the truthful variant. A fixture that
  forces the clause without receipts fails.
- **AC-S74-3** — the clause is driven by recorded receipt evidence, not by a flag, a template default,
  or an operator checkbox that is not itself evidence of a send. A test asserts no code path can render
  the clause from an empty `channelReceipts`.
- **AC-S74-4** — the tenant renewal copy is editable through the approved-template store by an
  authorized operator, and the edit is visible in a rendered draft without a code deploy.
- **AC-S74-5** — editing approved copy mints a new artifact version with a new `contentHash` and an
  unapproved state; the previous version remains readable at its own hash. A fixture that mutates copy
  in place while retaining the old approval **fails closed**, closing the `AC-S24-3` hole.
- **AC-S74-6** — a draft composed from an unapproved copy version cannot be created or sent; the refusal
  names the version and the missing approval.
- **AC-S74-7** — the Email and Portal-chat variants remain byte-identical to each other unless a
  deliberate, separately-approved divergence is recorded, so a Text-only edit cannot silently change the
  other two.
- **AC-S74-8** — no rendered variant claims a channel whose send key is `production_allowed:false`
  actually delivered, in any fixture, under any flag.

**Forbidden actions / hard gates.** No autonomous, scheduled, bulk, or model-triggered client-facing
send. This suite adds **no send path** — it changes wording and the conditions under which a claim is
made. The past-tense both-channel clause may never be rendered from anything other than recorded receipt
evidence; a flag, a default, an operator assertion without a recorded send, or an empty receipt set must
all produce the truthful variant. `AC-S24-4` is not amended or weakened to make the client's sentence
render unconditionally. Editing copy must never silently invalidate a governed artifact's approval while
leaving the approval claim in place. The portal-chat and SMS send keys stay `production_allowed:false`;
nothing here opens them. Do not answer `Q-S74-TRUTHFUL-VARIANT` by inventing client-facing wording and
shipping it as final — ship a plain default and ask.

**Ordered prompt sequence.**

1. Promote the tenant renewal copy into the approved-template store; make the store's second caller
   real.
2. Enforce mint-a-new-version-on-edit and fail closed on a modified artifact still claiming an old
   approval (`AC-S74-5`, closing the `AC-S24-3` hole).
3. Adopt the team's wording as the both-channel-success variant.
4. Add the truthful variant and make clause selection depend on recorded receipts only.
5. Prove the refusal path: unapproved version cannot compose a draft.
6. Raise `Q-S74-TRUTHFUL-VARIANT` and `Q-S74-MANUAL-RECEIPT` to the client as confirm-with-default
   questions.

**Deletion/merge recommendation.** Keep as its own suite. It looks like a copy change and is actually a
governance fix — `AC-S24-3` is currently unenforced against an in-repo edit, and that is worth its own
tracked slice. Do not merge into S24: S24 is the standing policy, this is the renewal-copy implementation
that makes the policy true. Once `Q-S74-MANUAL-RECEIPT` resolves, the manual-receipt record may fold into
S25's execution contract rather than growing this suite.
