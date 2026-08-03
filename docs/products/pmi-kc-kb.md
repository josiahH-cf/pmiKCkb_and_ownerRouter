# PMI KC KB Product Lane

## Product target and current posture

PMI KC KB is the deployed source-backed application and shared runtime for the product lanes. It
includes Firebase staff authentication, role/Space capabilities, Console/Ask, primary Spaces,
Approvals, Notifications, Connections, Renewals, Maintenance, workflow Communications, task Admin,
trusted publication, attention, explicit actions, and the external Vendor boundary.

S40–S50 establish the product posture:

- Production is the hosted product environment and contains Live data only;
- local rehearsal resolves explicit Demo plus Live-read-only context and cannot create a Live effect;
- a hosted Demo project and fixture seeder are deferred;
- no Demo/Test product tools ship in Production;
- the shell has four daily destinations plus primary Spaces;
- attention, renewal, approval, Maintenance, Communications, Connections, and Admin each have one
  clear owner; and
- browser simulations/no-op Sample tools are retired through two evidence-backed stages.

The deployed service is `pmi-kc-app` at
`https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`. Its Production projection is Live-only: the product
Test lane and fixture routes are retired, and zero `data_mode:"test"` records remain across the 28
governed collections. The former Production Live+Test journeys remain dated historical evidence;
equivalent deterministic contract coverage lives in automated tests.

## Roles

| Role                    | Product authority                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor                  | Ask, read scoped Spaces/sources, edit allowed app records/content, use scoped Renewal/Maintenance desks, resolve permitted Low/Medium work, and create governed drafts with required exact confirmation. |
| Approver                | Editor capabilities plus app-plane decisions and permitted exact-confirmed workflow replies.                                                                                                             |
| Admin                   | Approver capabilities plus people/scopes, configuration, content publication, High-risk exact decisions, provider activation/kill switches, retention, and Advanced diagnostics.                         |
| Vendor                  | Separate external Firebase principal; assigned Maintenance tickets only, no internal shell/Console/Spaces/Admin/DWD/cross-mailbox authority.                                                             |
| Resident intake session | Not a user role. A short-lived, one-intake bearer session can answer approved Maintenance questions/upload allowed photos/acknowledge approved wording only.                                             |

Technical Blocked conditions cannot be approved away. Admin self-approval is allowed only on the
exact current preview with a reason and cannot bypass missing provider/identity/source evidence.
Hiding a navigation item never replaces server authorization.

## Primary destinations and ownership

- **Console:** Ask plus bounded Work now counts/links.
- **Renewals:** one desk and one per-unit four-stage workspace.
- **Maintenance:** focused ticket list/detail and staff review.
- **Approvals:** one-card decisions on phone and desktop.
- **Spaces:** first-class searchable grouped knowledge/source directory, not an equal-card desk
  catalog.
- **Notifications:** chronological event history and unread state only.
- **Communications:** workflow-linked messages/actions only.
- **Connections:** provider setup, reviewed front doors, health, action availability, and Advanced
  diagnostics.
- **Admin:** task dashboard for People & access; Spaces & sources; Decisions & content rules;
  Notifications & support; Retention & audit; Advanced.

The app owns the central workflow state: human summary, status, next action, blocker, owner, due
date, timeline, decisions, receipts, and verified provider backlinks. RentVine remains authoritative
for property/lease/contact/work-order facts; other providers retain their own records.

## Environment and data behavior

The deployed boundary uses server-owned, fail-closed environment/context:

| Surface         | Allowed product data/effect                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Local rehearsal | Explicit `environmentKind:"demo"` + `dataContext:"live_readonly"` + `source:"explicit"`; no app/provider mutation or seeded fixtures. |
| Production      | Live data and independently enabled Live actions only. Missing/unknown/Demo/Test classification is rejected.                          |

Local rehearsal cannot construct Production effect clients or credentials. `Test` remains an
engineering-verification term, not operator product copy; invented aliases, `.invalid` addresses,
fake transports, and deterministic fixtures are confined to automated tests.

## Maintenance, Vendor, and resident intake

Staff tickets retain assignment, status, notes/activity, photos, workflow communication, close/
reopen, exact provider actions, receipts, and business closeout. Normal ticket UI shows the task,
next permitted action, evidence, and history; full provider readiness lives in Connections, and no
simulator/lab ships.

The implemented Live Vendor seam is fail-closed and its invite, assignment-change, and disable action
keys remain Production-closed until a named real Vendor and the protected per-key activation review:

- Admin exact-previews and confirms an invite for one routable assigned Vendor address;
- invite uses a deterministic Firebase identity plus exact Gmail Message-ID/recipient readback, a
  one-time fragment-to-body setup challenge, and generation-bound reissue/recovery;
- verified email, password, TOTP, and the active Vendor/ticket assignment join are required before
  ticket detail or communication access;
- disable cuts off Firestore access first and verifies bounded session/identity revocation; and
- optional same-address Live OAuth/vault activates separately for each real Vendor, never through DWD
  or internal cloud access.

The former canonical `.invalid` Vendor and its no-provider mailbox/actions are retained only as
deterministic automated-test fixtures. Product routes operate on real, assigned Live Vendors.

S47 adds a no-second-login resident intake: opaque short-lived single-purpose token, approved
troubleshooting graph, appropriate photos excluded from indexing, versioned possible-charge
acknowledgement, idempotent resident submit, explicit staff review, and a RentVine portal/text
adapter built to its documented endpoint seam. The token is not a staff/Vendor identity and never
grants ticket enumeration or provider authority.

## External actions and destinations

The Action Registry reports each Live action independently. A Live write/send requires documented
provider semantics, authoritative mapping, least privilege, exact target/effect preview, required
human authority, one claim/idempotency, value-minimized receipt/readback, monitoring, kill switch,
and correction/rollback.

Every supported provider also has a safe outbound destination. Prefer a verified exact record URL;
otherwise show the reviewed provider front door with `Exact record link unavailable`. A generic
link is navigation, never source evidence, and is never derived from a guessed record pattern.

When a provider dependency is missing, build the app-plane and live adapter/full contract to the
seam, keep only that Live action unavailable, and continue unrelated work. Local Live-read-only
rehearsal and deterministic tests remain usable; neither counts as Live proof.

## Sources, publication, and page layout

Editors/Admins may add in-scope files/folders/process definitions through the configured publication
policy. Validation enforces root, Space, type, MIME, size, malware, sensitivity, source state,
citations, and process/action references before immutable Active versions. Published content cannot
change roles, prompts, Registry state, provider credentials, environment, or execution authority.

After the canonical S40–S49 IA baseline, S50 implements S37’s page builder with a fixed typed inert
component library and code-defined safe layout regions. It cannot change fixed shell/route
ownership, required workflow controls, roles/scopes/environment, provider gates, or invoke an
executor.

Missing facts display `Needs Verification: <fact>` or `No Reliable Source Found`. Customer records,
secrets, message bodies, resident bearer tokens/photos, and sensitive excluded tabs never enter
repository evidence.

## Retention, deletion, and operations

Value-minimized operational state, versioned retention, legal hold, bounded cleanup, and visible
health remain the baseline. Shipped simulations/no-op Sample controls/duplicate panels retire in
two stages: hide/move/redirect/instrument, then bounded deletion only after consumer/role/route/test/
deployed-boundary/rollback proof. Static reachability never deletes a provider/security/rollback
seam.

## Acceptance

- Admin and Editor complete their scoped whole tasks on desktop and 390×844 without navigation
  wrapping, overlay collisions, duplicated owner lists, or engineering jargon.
- Local rehearsal and Production show unambiguous server-owned context and cannot cross records,
  credentials, effects, or receipts; Production contains Live only.
- Renewal, one-card Approval, focused Maintenance, workflow Communications, Connections, Admin, and
  Spaces meet their S41–S49 owners and exact-link contracts.
- Live Vendor invite/setup/TOTP/assignment/disable isolation and resident intake token/object
  authorization remain fail-closed; the Live action keys stay closed until named activation.
- Every enabled Live action retains exact authority, one attempt, receipt/readback, monitoring, and
  rollback; no autonomous client-facing send or generic mailbox/send exists.
- No secrets/customer content enter git, logs, notifications, migration evidence, or value-minimized
  audit.
