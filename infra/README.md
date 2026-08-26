# Infrastructure

PMI KC runs in the already-provisioned `pmi-kc-kb-prod` Google Cloud project. Application and
configuration automation lives in `scripts/`; provider-specific deployable infrastructure lives
here.

Current production infrastructure includes Cloud Run, Firestore, Firebase Authentication, Secret
Manager, Cloud Billing budgets and notifications, the budget guardrail function, Pub/Sub, Gmail
watch plumbing, and approved search/storage resources. Do not describe this repository as an
unprovisioned scaffold.

Infrastructure work follows `AGENTS.md`, `docs/environment-handoff.md`, and
`docs/budget-and-cost-policy.md`:

- use only managed `pmikcmetro.com` or project service identities;
- print/review bounded plans before mutation;
- read every cloud change back;
- preserve current Production + Live configuration and Secret Manager bindings;
- never infer a client-facing send or system-of-record write from cloud access; and
- treat `infra/budget-guardrail/**` as a protected path.
