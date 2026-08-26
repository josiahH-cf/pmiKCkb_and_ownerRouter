<!-- spec-shape: overhaul-v1 -->

# S64 — Per-person approval authority

> Status: Specified but NOT authorized. Current roles and approval rules remain unchanged.

**Goal.**

If explicitly authorized, allow differentiated approval permission without weakening exact action confirmation.

**What it is / how it functions.**

A future design would add explicit person/action scope with deny-by-default, Admin audit, revocation, and no inference from ordinary role or Space access.

**Open questions & assumptions.**

Owner must explicitly authorize the safety-control change and settle scope, delegation, expiry, and recovery.

**Cross-product impacts.**

Auth, Firestore Rules, approvals, Action Registry execution, Admin people/access, and audits.

**Adversarial acceptance checks.**

- **AC-S64-1** — Without a new explicit grant, no code or rule change for S64 is permitted.
- **AC-S64-2** — Any future permission is explicit, least-privilege, revocable, and deny-by-default.
- **AC-S64-3** — Space membership, Editor role, or task assignment never silently implies provider approval.

**Forbidden actions / hard gates.**

No implementation, protected-path push, implicit inheritance, self-grant, or client-visible effect under the current authority.

**Ordered prompt sequence.**

1. Stop until the owner names S64 authorization.
2. If authorized, write a fresh decision-complete spec.
3. Implement with protected auth/Rules review and adversarial privilege tests.

**Deletion/merge recommendation.**

Keep visible as unauthorized; delete if the owner rejects it.
