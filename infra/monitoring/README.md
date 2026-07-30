# Production monitoring definitions

This directory is the declarative S51 source for one internal operator channel, one A2
logs-based counter metric, and four alert policies. Definitions contain non-secret target
tokens only. The operator address is supplied at plan or verification time and is never
committed.

`npm run monitoring:plan -- --operator-email=<internal-address>` prints an owner-run
provisioning and rollback runbook. It does not execute a command or construct a cloud
client. The named operator must complete Google's email-channel verification before the
channel is usable.

`npm run monitoring:verify -- --live --operator-email=<internal-address>` performs
read-only, paginated metadata reads after managed authentication. It never creates,
updates, or deletes a resource, and it reports ready only when the channel is verified.
