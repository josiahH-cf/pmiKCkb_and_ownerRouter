# Workflow Communications product lane

The filename is retained for compatibility. This is a workflow communication adapter, not a general
Gmail inbox.

## Current October 16 source boundary

S229 narrows the historical program below to workflow-linked reads, labels and reviewed unsent
renewal Gmail drafts. Current production-operation admission refuses client Send/Schedule/Resume,
generic replies and worker dispatch before provider construction. App-saved wording is identified
separately from a Gmail draft. Custom maintenance effects are retired under S227; Vendoroo remains
standalone. Original attempts, delivery records and own-attempt recovery retain their meaning.
This source change is not yet deployed, and fresh managed Gmail readback remains blocked by approved
account reauthentication. See docs/spec.md and docs/loop-state.md.

## Historical verified serving capability

- Authenticated workflow-linked mailbox reads, exact thread replies and governed labels.
- Renewal and maintenance owner unsent-draft creation, with a human sending from Gmail.
- Pub/Sub/watch infrastructure, in-app attention and bodyless audit/receipt evidence.
- Exact mailbox, thread, recipient, source and content confirmation.

The October 9 serving readback is recorded in `docs/facts.md`; it does not deliver the new program.

## Historical S183 program and activation wording

The following paragraphs preserve the earlier authorization and pre-activation wording for
compatibility and provenance. The notice keys subsequently activated in the October 10 release;
their protected metadata is unchanged. The current October 16 operation-level refusal overrides
those open keys. Neither this history nor an earlier receipt authorizes sending or a proof rerun.

The owner's S183 instruction authorizes human Send/Schedule for the named S183–S226 program.
The shared workflow hub/composer binds the exact managed sender, current record/recipients,
rich/plain message, reviewed files, version and bounded initial/follow-up schedule. S189–S192 own
one durable at-most-once occurrence, current-access rechecks, inbound-reply pauses, receipt/readback,
team handoff and ambiguity recovery. New authorization is required when its bound content changes.

Both notice send keys remain closed until their technical gates and reviewed exact-key activation
pass. Generic `gmail.message.send` remains closed. Runtime configuration, a model answer, migrated
records, copied wording and old drafts cannot grant Send/Schedule authority. Original draft,
reply and unknown-attempt history retains its actual meaning and own-attempt recovery.

## Boundaries

- No free-form general inbox browsing, generic compose or blast send.
- No autonomous client-facing send; current operation policy also refuses human client sends and schedules in the app.
- Outside Gmail discovery/linking remains scoped and read-only.
- S100 resident-reply draft remains closed; its remaining maintenance proof/activation is retired.
- Sample/test content cannot create a real draft, send or production record.
- Missing sender/runtime/key, stale targets, conflicting edits and unresolved provider attempts
  remain explicit holds. No live customer effect is used to demonstrate a test.
- S182 Dotloop API-origin exclusions, backend permissions, managed identities and unrelated
  closed provider keys remain intact.

The native program ledger records actual component, emulator, compiled, provider and human scopes;
implementation and delivery remain incomplete while required outcomes or prerequisites are open.
