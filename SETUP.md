# PMI KC KB Setup

This is the repo-local setup guide for the KB scaffold. The full production runbook is
in `docs/spec.md` Appendix B.

## Local

```bash
npm install
cp .env.example .env.local
npm run dev
```

The scaffold runs without live Google services. Until Vertex AI Search is configured,
the Ask API intentionally returns `No Reliable Source Found`.

Protected app pages require the server auth guard. Unauthenticated browser visits
redirect to `/sign-in`, where the Firebase browser SDK signs in with Google and
exchanges the ID token for an HTTP-only server session cookie.

Firebase Admin ID-token and session-cookie verification uses Application Default
Credentials in local and deployed environments. Set `GCP_PROJECT_ID` or
`FIREBASE_PROJECT_ID`, set the `NEXT_PUBLIC_FIREBASE_*` browser values from the
Firebase web app config, keep `AUTH_SESSION_COOKIE=__session` unless the cookie name
changes, and do not commit service-account keys.

## Verify

```bash
bash scripts/verify.sh
```

The verifier installs from `package-lock.json`, checks formatting, lints, typechecks,
runs tests, verifies the Router boundary, and builds the app.

## Google Setup Milestone

When integration work begins:

1. Create staging and production GCP projects.
2. Enable Vertex AI, Discovery Engine, Firestore, Cloud Run, Identity Platform, Gmail
   API, Drive API, Secret Manager, Cloud Logging.
3. Configure Firebase Auth / Identity Platform with Google provider.
4. Create a Firebase web app and copy its public config into `.env.local`.
5. Create Firestore Native mode in `us-central1`.
6. Configure one Drive folder and one Vertex AI Search data store per KB Space.
7. Grant the KB service identity `drive.readonly` on KB folders and the Owner Router
   folder only.
8. Grant Gmail send-only authority for `KB Approval` notifications.

Do not grant Gmail read, Gmail modify, Gmail compose, Drive write, or system-of-record
write scopes.
