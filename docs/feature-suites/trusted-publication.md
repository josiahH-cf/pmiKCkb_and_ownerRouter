<!-- spec-shape: overhaul-v1 -->

# S21 — Trusted immediate source and process publication

> **Status: Local green (2026-07-14).** App-plane policy, bounded validation, scanner interface/fail-
> closed provider boundary, immutable version/Active pointer/rollback/audit, process and Space UI, and
> Firestore denial are implemented. Production roots, scanner activation, import/indexing, Drive
> changes, deploy, and live proof remain gated.

> New 2026-07-14. Implements R05. Validation-passing Editor additions become Active immediately; the
> old default approval detour is superseded for content publication only.

**Goal.** Editors can add process versions, files, folders, and sources inside their assigned Space
without waiting for an Admin, while unsafe, out-of-root, oversize, malicious, sensitive, or structurally
invalid content fails visibly. Every accepted addition is versioned, reversible, scoped, and audited,
and no document can change runtime authority.

**What it is / how it functions.**

- **Admin trust policy — `lib/publication/policy.ts` (new).** Admin configures connector/root IDs,
  allowed Spaces, allowed extensions/MIME types, per-type byte caps, sensitivity ceiling, and scanner.
  No client secret or raw content enters the policy record. Launch defaults: Markdown/text 2 MB, PDF
  25 MB, DOCX 25 MB, CSV 10 MB, common images 10 MB; executables, archives, macros, credential files,
  and unknown types are denied. Admin may tighten, never silently widen, a connector policy.
- **Validation pipeline.** Server resolves the configured root and Editor scope; checks path/root,
  extension plus detected MIME, size before buffering, malware result, credential/secret/PII
  sensitivity result, schema/source-state/citation fields, and process graph validity. Any unavailable
  required scanner is a visible failure, not a bypass.
- **Atomic publication.** A passing save writes immutable version + append-only audit and atomically
  updates the Active pointer. Rollback creates a new version pointing to the prior content; history is
  never rewritten. Failed validation writes a bodyless failure audit and no Active pointer.
- **Authority firewall.** Imported content is data. It cannot write custom claims, Action Registry,
  connector policy, environment config, prompt/system instructions, or executor enablement. Process
  steps reference only pre-registered action keys and cannot make a disabled action executable.
- **Buildable now (app-plane).** Policy/schema, validators, scanner interfaces/fakes, version/rollback,
  audits, UI results, and emulator tests.
- **Gated (owner / vendor).** Production root/connector configuration, malware provider activation,
  source import, Drive changes, indexing, deploy, and live proof.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ publication is immediate after automated validation; there is no routine
  human approval step.
- _Answered 2026-07-14:_ scope/root/type/size/malware/sensitivity/rollback/audit are mandatory and
  content cannot enable actions or widen roles.
- _Assumption:_ the conservative launch caps/types above are implementation defaults; Admin may reduce
  them by connector. Adding a new type or raising a cap is an audited Admin policy change.
- _Assumption:_ “sensitivity check” rejects apparent credentials, SSNs, bank/ledger data, full lease
  packets, raw screening records, and source content above the Space policy. It does not store the
  detected secret in logs.
- _Client-owned:_ Admin must select actual production root IDs and Space mappings before live import.

**Cross-product impacts.** Touches process-definition routes, Space source UI, launch content, source
state/citations, ingestion/indexing, Firestore schemas/rules, Admin connection settings, and Ask
retrieval. It supersedes approval-queue routing for validation-passing content but not High external
actions. Supersede marker: `EDITOR-CONTENT-APPROVAL-DEFAULT`.

**Adversarial acceptance checks.**

- **AC-S21-1** — In-scope Editor content passing every check becomes Active in one transaction with an
  immutable version and append-only audit; no Approval Queue item is created. _Verify:_ `npm test --
trusted-publication`; `npm run test:firestore`.
- **AC-S21-2** — Wrong root/Space, path traversal, MIME mismatch, oversize body, denied type, scanner
  unavailable/malware, or sensitivity violation creates no Active pointer and exposes a specific safe
  error without echoing detected content. _Verify:_ `npm test -- publication-validation`.
- **AC-S21-3** — A process/source containing role, claim, registry, `production_allowed`, executor, or
  system-prompt instructions remains inert data and cannot change any authority record. _Verify:_
  `npm test -- publication-authority-firewall action-gate`.
- **AC-S21-4** — Concurrent saves create ordered immutable versions; rollback creates a new audited
  version and restores the selected content without deleting later history. _Verify:_ `npm test --
publication-versioning`; `npm run test:firestore`.
- **AC-S21-5** — Admin policy changes require `manageAdmin`, a reason, append-only audit, and cannot be
  supplied in an Editor upload request. _Verify:_ `npm test -- publication-policy route-auth-boundary`.
- **AC-S21-6** — Retrieval returns only the current Active validated version and preserves source
  state/citation/refusal behavior; missing/failed content never becomes a generic answer source.
  _Verify:_ `npm test`; keep source-state/citation/anti-hallucination tests green.
- **AC-S21-7** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run verify:redaction`, `npm run verify:router-boundary`, `npm run build`.

**Forbidden actions / hard gates.** No live source read/import/index, Drive mutation, root creation,
scanner subscription, or deploy. No raw rejected content in logs/audits/git. No content-driven role,
scope, Action Registry, external execution, scheduled action, or prompt-authority change. Production
must fail closed if required validation is unavailable. ~$10 cap applies.

**Ordered prompt sequence.**

1. _Discovery:_ inventory process/source mutation routes, schemas, rules, retrieval filters, current
   approval creation, file handling, and tests.
2. _Build:_ add Admin policy schema and strict configured-root/Space/type/size enforcement.
3. _Build:_ add bounded stream handling, MIME detection, scanner/sensitivity interfaces and safe fake
   providers; test every refusal before content persistence.
4. _Build:_ implement immutable version, Active pointer, append-only audit, and rollback transaction.
5. _Build:_ remove the approval detour only for validation-passing publication; add the authority
   firewall and process action-reference validation.
6. _Verify:_ run focused/emulator/redaction tests and full verification; falsify path, polyglot file,
   race, scanner outage, credential string, and role/action injection.
7. _Gate:_ stop before configuring production roots, importing sources, enabling a scanner, indexing,
   or deploy; produce exact Admin setup fields.
8. _Context update:_ add `F-TRUSTED-PUBLICATION-BUILT` citing AC-S21-1..7 and update status/plan/loop.

**Deletion/merge recommendation.** KEEP as the canonical publication spec. MERGE obsolete
approval-first publication prose out of active plan/product docs when S21 ships; retain audit history.
