# S51 production operations owner packet

**Status: NOT RUN.** No monitoring resource, log-retention setting, or IAM binding in this packet has
been created, changed, verified, or removed. This packet contains no operator address, budget value,
credential, token, customer value, or S40 target identifier.

This is the owner-run activation packet for the S51 monitoring bundle and log-hygiene settings. It
does not authorize a client-facing send, a system-of-record write, a provider gate change, or any
other IAM change.

## Preconditions

Do not run a cloud command from this packet until all of these are true:

1. S52 has a reviewed, non-null Production alert threshold and hard-stop ceiling, both enforcement
   points agree, and the budget guard is green. This packet supplies no numeric cost value.
2. S40 has settled the exact Production project, region, and Cloud Run service. Supply those values
   explicitly at runtime. Do not rely on the planner's historical current-target defaults.
3. The owner has supplied one exact managed internal operator address through the approved
   out-of-repository handoff. It must use the `pmikcmetro.com` domain. Never write it into this file,
   a shell-history artifact committed to git, or a captured plan committed to git.
4. The owner has reviewed the direct log-viewer grant and the current IAM inventory. The generated
   plan adds only `roles/logging.viewer` to the named operator. It does not grant private-log access,
   remove a primitive role, or prove that inherited broad access is absent.
5. The repository full gate is green at the exact commit being activated.

Establish all three authentication checks in one owner-attended session:

```bash
npm run auth:session
npm run preflight:adc
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud auth print-access-token >/dev/null
```

The active account must be a managed `pmikcmetro.com` identity or the documented managed service
identity. Stop if ADC is stale, the CLI token check fails, or a personal identity appears.

## Generate and review the print-only plan

Set these variables in the current shell from the approved handoff. Do not save their resolved values
in git:

```bash
test -n "$MONITORING_OPERATOR_EMAIL"
test -n "$PRODUCTION_PROJECT_ID"
test -n "$PRODUCTION_REGION"
test -n "$PRODUCTION_SERVICE"

npm run monitoring:plan -- \
  --operator-email="$MONITORING_OPERATOR_EMAIL" \
  --project="$PRODUCTION_PROJECT_ID" \
  --region="$PRODUCTION_REGION" \
  --service="$PRODUCTION_SERVICE"
```

The command above is print-only. It must print, and never execute:

- a read-only fresh-setup preflight that lists exact S51 managed channels and policies, lists the
  fixed A2 metric, and captures both log-hygiene before-states before any mutation;
- one internal email notification channel;
- one value-free A2 logs-based metric;
- four attached alert policies;
- an explicit 30-day `_Default` retention update;
- one direct `roles/logging.viewer` grant to the named operator only when the successful preflight
  proved that exact unconditional binding absent;
- readbacks for the channel, metric, policies, bucket, and exact direct binding; and
- a rollback section in which every mutation is guarded by a marker set only after this run
  successfully created or changed that resource.

Review the whole output. Execute preflight section 1 and setup sections 2 through 6 manually in the
same shell so its checked captures, readiness state, resource names, and run-ownership markers remain
available. Do not skip, reorder, or split the preflight from the setup. Every setup mutation checks
the readiness marker again, so a failed read, invalid before-state, or pre-existing managed resource
keeps all mutations blocked even if a later line is attempted. Stop on the first refusal or mutation
failure. Do not execute the rollback section during setup.
Do not pipe the resolved plan to a repository file because it contains the runtime-supplied operator
address.

Fresh setup refuses when any S51 managed channel or policy, or the fixed A2 metric, already exists.
That state can be a completed activation, drift, or a partial earlier run. Run the read-only
`monitoring:verify` command below, inspect the exact resources outside git, and use a separately
reviewed manual recovery. Never bypass the refusal or delete an existing resource merely to make the
fresh plan pass.

The notification-channel recipient must complete Google's email-channel verification before
monitoring can report ready.

## Read back and verify

The application verifier checks only the notification channel, A2 metric, and four policies. It is
read-only and requires an explicit live acknowledgement:

```bash
npm run monitoring:verify -- \
  --live \
  --operator-email="$MONITORING_OPERATOR_EMAIL" \
  --project="$PRODUCTION_PROJECT_ID" \
  --region="$PRODUCTION_REGION" \
  --service="$PRODUCTION_SERVICE"
```

Read back the separate log-hygiene settings:

```bash
gcloud logging buckets describe _Default \
  --project="$PRODUCTION_PROJECT_ID" \
  --location=global \
  --format='value(name,retentionDays)'

gcloud projects get-iam-policy "$PRODUCTION_PROJECT_ID" \
  --flatten='bindings[].members' \
  --filter="bindings.role=\"roles/logging.viewer\" AND bindings.members=\"user:${MONITORING_OPERATOR_EMAIL}\" AND -bindings.condition:*" \
  --format='value(bindings.role,bindings.members)'
```

The first result must report 30 retention days. The second must report the exact direct
unconditional `roles/logging.viewer` binding for the named managed operator. A conditional viewer
binding does not count as a pre-existing unconditional grant: setup uses `--condition=None`, the
capture and readback require the condition field to be absent, and rollback removes that
unconditional binding only when a run-ownership marker proves both a successful absent capture and a
successful add by this run.

Separately inspect the complete IAM policy through the owner-approved console or a local,
non-committed `gcloud projects get-iam-policy` readback. Adding the direct viewer binding does not
remove an inherited Owner, Editor, Viewer, group, folder, or organization grant. Do not claim
least-privilege completion until that inventory is reviewed. Do not remove a broad role from this
packet; an exact removal requires a separately reviewed identity and responsibility analysis.

Record only sanitized resource names, verification state, retention-day count, timestamps, and
pass/fail results. Do not commit the operator address, IAM principal inventory, log bodies, tokens,
or customer values.

## Rollback

Use the rollback section from the original generated plan in the same shell that captured
`LOG_BUCKET_RETENTION_DAYS_BEFORE`, `LOG_VIEWER_BINDING_BEFORE`, the created resource names, and all
`*_BY_THIS_RUN` markers. Do not regenerate the plan before rollback, because a new preflight would
observe the post-change state and refuse. If the original shell or its markers are lost, do not guess
ownership and do not run a delete or IAM removal; use the verifier plus a separately reviewed manual
recovery.

The log-hygiene rollback is:

```bash
if test "${LOG_RETENTION_CHANGED_BY_THIS_RUN:-0}" = 1; then
  if gcloud logging buckets update _Default \
    --project="$PRODUCTION_PROJECT_ID" \
    --location=global \
    --retention-days "$LOG_BUCKET_RETENTION_DAYS_BEFORE"; then
    LOG_RETENTION_CHANGED_BY_THIS_RUN=0
  else
    printf '%s\n' 'Rollback failed; keep the run marker and use reviewed manual recovery.' >&2
    false
  fi
fi

if test "${LOG_VIEWER_BINDING_ADDED_BY_THIS_RUN:-0}" = 1; then
  if gcloud projects remove-iam-policy-binding "$PRODUCTION_PROJECT_ID" \
    --member="user:${MONITORING_OPERATOR_EMAIL}" \
    --role=roles/logging.viewer \
    --condition=None; then
    LOG_VIEWER_BINDING_ADDED_BY_THIS_RUN=0
  else
    printf '%s\n' 'Rollback failed; keep the run marker and use reviewed manual recovery.' >&2
    false
  fi
fi
```

The IAM marker is set only after a successful checked capture proved the unconditional binding absent
and this run successfully added it. A failed capture never sets readiness or the marker. A
pre-existing unconditional binding is left untouched; a pre-existing conditional viewer binding does
not count as the unconditional binding and does not suppress removal of the separately added,
run-owned unconditional binding.

The monitoring-bundle rollback uses the captured resource names from the original plan:

```bash
if test "${MONITORING_POLICY_A4_CREATED_BY_THIS_RUN:-0}" = 1; then
  if gcloud monitoring policies delete "$MONITORING_POLICY_A4_NAME" \
    --project="$PRODUCTION_PROJECT_ID" --quiet; then
    MONITORING_POLICY_A4_CREATED_BY_THIS_RUN=0
  else
    printf '%s\n' 'Rollback failed; keep the run marker and use reviewed manual recovery.' >&2
    false
  fi
fi
if test "${MONITORING_POLICY_A3_CREATED_BY_THIS_RUN:-0}" = 1; then
  if gcloud monitoring policies delete "$MONITORING_POLICY_A3_NAME" \
    --project="$PRODUCTION_PROJECT_ID" --quiet; then
    MONITORING_POLICY_A3_CREATED_BY_THIS_RUN=0
  else
    printf '%s\n' 'Rollback failed; keep the run marker and use reviewed manual recovery.' >&2
    false
  fi
fi
if test "${MONITORING_POLICY_A2_CREATED_BY_THIS_RUN:-0}" = 1; then
  if gcloud monitoring policies delete "$MONITORING_POLICY_A2_NAME" \
    --project="$PRODUCTION_PROJECT_ID" --quiet; then
    MONITORING_POLICY_A2_CREATED_BY_THIS_RUN=0
  else
    printf '%s\n' 'Rollback failed; keep the run marker and use reviewed manual recovery.' >&2
    false
  fi
fi
if test "${MONITORING_POLICY_A1_CREATED_BY_THIS_RUN:-0}" = 1; then
  if gcloud monitoring policies delete "$MONITORING_POLICY_A1_NAME" \
    --project="$PRODUCTION_PROJECT_ID" --quiet; then
    MONITORING_POLICY_A1_CREATED_BY_THIS_RUN=0
  else
    printf '%s\n' 'Rollback failed; keep the run marker and use reviewed manual recovery.' >&2
    false
  fi
fi
if test "${MONITORING_METRIC_CREATED_BY_THIS_RUN:-0}" = 1; then
  if gcloud logging metrics delete pmi_kc_unresolved_live_effect_count \
    --project="$PRODUCTION_PROJECT_ID" --quiet; then
    MONITORING_METRIC_CREATED_BY_THIS_RUN=0
  else
    printf '%s\n' 'Rollback failed; keep the run marker and use reviewed manual recovery.' >&2
    false
  fi
fi
if test "${MONITORING_CHANNEL_CREATED_BY_THIS_RUN:-0}" = 1; then
  if gcloud beta monitoring channels delete "$MONITORING_CHANNEL_NAME" \
    --project="$PRODUCTION_PROJECT_ID" --quiet; then
    MONITORING_CHANNEL_CREATED_BY_THIS_RUN=0
  else
    printf '%s\n' 'Rollback failed; keep the run marker and use reviewed manual recovery.' >&2
    false
  fi
fi
```

After rollback, repeat the bucket and IAM readbacks and confirm the monitoring resources are absent.
The generated plan clears each marker only after its guarded rollback succeeds, so a failed rollback
can be retried without guessing. No command here deletes the Cloud Run service, a revision, Firestore
data, a credential, a pre-existing monitoring resource, or an unrelated IAM binding.
