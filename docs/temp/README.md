# Local scratch only

`docs/temp/` is ignored local scratch. It is not part of the active documentation set and must not be
loaded as default context, cited as evidence, or used to resume work.

Rules:

- Do not store secrets, tokens, raw Gmail content, customer records, leases, ledgers,
  bank data, SSNs, or client-private source material here.
- Treat every file here as disposable and potentially stale.
- Promote only a newly verified present fact into the active file named by `docs/README.md`.
- Delete scratch when it is no longer useful; Git-tracked history never belongs here.
