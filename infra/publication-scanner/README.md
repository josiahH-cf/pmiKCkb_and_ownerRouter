# Managed publication scanner container

This service is a genuine ClamAV byte scanner, not a signature substitute or a
sensitivity classifier. The application performs its separate, narrowly described
credential-content check. The application's exact policies govern process-definition
publication and renewal-original preparation separately; this container grants no
generic file/folder publication authority or legal-content approval.

## Authentication and deployment contract

The receiving Cloud Run service **must enforce Cloud Run IAM authentication**.
Grant service-level `roles/run.invoker` only to the application's existing managed
runtime service account. Do not grant `allUsers` or `allAuthenticatedUsers`, expose
the Unix socket, add a service-account key, substitute a personal identity or
change the application's existing environment/secrets. The HTTP implementation
relies on that receiving IAM boundary; it does not independently authenticate an
unprotected server. The application must use an ID token whose audience is the
actual service URL returned by resource readback, never a guessed URL.

Prepared defaults are one CPU, 4 GiB memory, concurrency one, min instances zero,
max instances one, a 75-second request timeout and a startup probe allowing the
bounded 180-second initialization. Request-based CPU billing is sufficient: no
idle background updater is claimed. These files do not create, build, deploy,
configure IAM, activate a publication policy or change any Action Registry key.

## Byte and freshness contract

`POST /v1/scan` accepts exactly `application/json`, one Content-Length, no transfer
encoding, at most 2 MiB and a UTF-8 JSON object without duplicate keys/nonfinite
numbers. Its JSON-only contract remains unchanged. Source also defines the distinct
`POST /v1/scan-renewal-original` path: exactly `application/pdf`, the same length and
encoding bounds, `%PDF-` at the start and `%%EOF` within the last 2,048 bytes. These
markers are shallow transport admission, not PDF validity or safety proof. The
application must separately perform bounded safe-PDF, complete text and hidden-field
inspection before permitting its governed preparation outcome. Other raw paths
remain refused. The managed candidate passed exact synthetic PDF bytes/hash, preserved JSON,
current-engine readiness, anonymous refusal and wrong-type/incomplete/generic-path checks.
Real engine clean/EICAR detection was qualified separately on the exact engine image; putting
EICAR inside a PDF comment returned clean. That failed expected-detection probe is retained and
does not establish detection of PDF-contained payloads. No original form was used as live proof.

Both endpoints scan original bytes through private Unix-socket ClamAV INSTREAM,
not reserialized content. A successful reply contains only protocol, SHA-256, byte
count, clean/detected status, engine version and loaded daily database version/time.
No source text, detection name, filename or tool output is returned or logged.
ClamAV can use ephemeral container-local temporary files while scanning; its
temporary directory and socket share a private directory with a restrictive umask.
Incomplete scans, limits, malformed replies, timeouts and updater failures fail
closed with `503 {"error":"scanner_unavailable"}`. Connection/header/body timeouts,
three worker slots, one engine lock and a one-second accepted-request interval
bound local work; the Cloud Run service configuration remains necessary.

The pinned official 1.4.6 LTS engine must agree with the verified daily.cvd/cld on
disk. `sigtool --info` must verify that database; its raw header's daily serial and
exact build epoch must match the running daemon's VERSION metadata. Daily data
older than 24 hours or dated in the future is refused. This is the application's
conservative policy, not a ClamAV update-service availability promise. Main database
age is not substituted for daily age. Startup runs bounded one-shot FreshClam,
then starts ClamAV; an active scan request refreshes after an hour and explicitly
reloads/polls the loaded database. A failed update remains unavailable until a
later bounded retry. `GET /ready` verifies existing disk/loaded metadata only and
never updates, starts or reloads the engine. Readiness is not a malware scan.

## Isolated checks and remaining qualification

Run protocol/controller fixture tests without installs or engine access:

```sh
python3 -B -m unittest discover -s infra/publication-scanner -p 'test_*.py'
```

These fixtures prove framing, limits, metadata identity/freshness and HTTP refusal
behavior only. They do **not** prove ClamAV installation, configuration acceptance,
database availability, actual clean/detection behavior or Cloud Run IAM.

Before enabling the process-only policy, qualify the exact built image in an
isolated environment using harmless process JSON and the official EICAR test
string in its specified raw-file format. Qualify the separate PDF endpoint with original-byte
clean/hash and outage/type/size/marker refusal checks, and retain the engine's separate real
positive/negative qualification. An embedded or encoded test string has no implied detection
contract: EICAR specifies its file format and ClamAV's versioned positive PDF unit test uses a
separate test database. Do not add that test database to the production service or infer broader
PDF-contained payload detection. Verify the exact hash
and byte count, no sensitive logs, the loaded/disk daily serial/time, expired and
future database refusals, update/reload timeout/outage, max-body/concurrency bounds
and authenticated/unauthenticated service calls. Use no customer data or production
test records. Keep raw qualification artifacts in approved private storage and
record sanitized outcomes separately. The local machine has no ClamAV or container engine installed.
November 3 managed qualification used the exact built image: real clean/EICAR checks passed
separately from authenticated HTTP JSON framing/clean checks and anonymous refusal. Escaped EICAR
JSON returned clean; decoded-payload detection is not claimed. Current signatures and actual byte
hashes were checked. See `docs/evidence/application-gap-implementation-2026-11-03.md` for scope and
remaining app publication verification. No customer data or production business record was used.

Official contracts: [Docker sizing/image lifecycle](https://docs.clamav.net/manual/Installing/Docker.html),
[ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html),
[database verification](https://docs.clamav.net/manual/Signatures.html),
[version-matched daemon configuration](https://raw.githubusercontent.com/Cisco-Talos/clamav/clamav-1.4.6/etc/clamd.conf.sample),
[version-matched updater configuration](https://raw.githubusercontent.com/Cisco-Talos/clamav/clamav-1.4.6/etc/freshclam.conf.sample),
[pinned official image](https://hub.docker.com/layers/clamav/clamav/1.4.6-debian13-slim/images/sha256-4cbcd1fea2e6dfa9ceca73e4f1555cdda39860ed45483d361535a8f1d50f72ae),
[Cloud Run service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service),
and [request CPU lifecycle](https://docs.cloud.google.com/run/docs/container-contract).
