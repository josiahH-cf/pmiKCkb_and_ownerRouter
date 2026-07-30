# S51 Firestore rules owner-review packet

**Status: NOT APPLIED.** This packet proposes one D12-protected change to
`firestore.rules` for owner review. It does not authorize that change, any deployment, or
any broader protected-path edit. The packet contains no PII, customer data, credentials,
tokens, project secrets, or literal operator identities.

## Proposed hunk

Insert these two matches before the final `match /{document=**}` deny rule. They follow the
existing `owner_transactional_destination` pattern exactly:

```rules
    // S51 runtime suspension state and its append-only audit are written server-side only.
    // Admins may read the operational records; no browser client may forge, clear, mutate,
    // or delete a stop or its audit evidence.
    match /runtime_action_suspensions/{actionKey} {
      allow read: if signedIn() && admin();
      allow create, update, delete: if false;
    }

    match /runtime_suspension_changes/{changeId} {
      allow read: if signedIn() && admin();
      allow create, update, delete: if false;
    }
```

The first collection has one presence-only document per exact Action Registry key, plus
the reserved `"*"` global-stop document. The second collection is the immutable operation
audit. Both are written through the Admin SDK by the `manageAdmin`-guarded server route.
The hunk permits Admin reads only; unauthenticated users, Editors, and Approvers cannot
read either collection, and no client role—including Admin—can create, update, or delete
either kind of record. Admin SDK behavior is unchanged because Firestore Security Rules
do not govern Admin SDK access.

This is containment only. It cannot set `production_allowed`, open a Registry key, change
auth or IAM, or create a live provider effect. Removing the hunk returns both collections
to the final catch-all client deny.

## Review and verification

1. Owner confirms the hunk is limited to the two collection matches above and that the
   final catch-all deny remains intact.
2. In a separate reviewed change, add the hunk and a Firestore emulator test named
   `tests/firestore/runtime-suspension.rules.test.ts`. The test must seed both collections
   with the Admin SDK and prove:
   - Admin client reads succeed.
   - unauthenticated, Editor, and Approver client reads fail.
   - create, update, and delete fail for every client role, including Admin.
3. Run the local gates:

   ```bash
   npm run test:firestore
   npm run test -- --run tests/unit/runtime-action-suspensions.test.ts tests/unit/runtime-suspension-route.test.ts tests/unit/runtime-suspension-admin-panel.test.tsx
   npm run lint
   npm run format:check
   git diff --check
   git diff -- firestore.rules tests/firestore/runtime-suspension.rules.test.ts
   ```

4. Commit the protected rules change separately only after explicit owner approval. Do not
   combine it with another protected path or a `production_allowed` change.
5. Deployment remains owner-run. After verifying the managed Firebase CLI identity and
   reviewing the exact commit, the owner may deploy only the rules:

   ```bash
   npm exec firebase -- login:list
   npm exec firebase -- deploy --only firestore:rules --project pmi-kc-kb-prod
   ```

No deploy command in this packet has been executed.

## Rollback

Keep the protected rules edit in a single commit. If the deployed rules must be rolled
back, create a normal revert commit—never rewrite history—then re-run the Firestore gate
and deploy the reverted rules:

```bash
git revert <approved-rules-commit>
npm run test:firestore
npm exec firebase -- deploy --only firestore:rules --project pmi-kc-kb-prod
```

After rollback, the final catch-all rule denies all client access to both collections;
the server Admin SDK path remains available. Record the reviewed commit, deploy result,
and rollback result using sanitized identifiers only.
