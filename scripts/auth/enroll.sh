#!/usr/bin/env bash
# Owner enrollment for the WSL credential store (S112). INTERACTIVE: the owner completes each Google
# sign-in in a browser (gcloud prints the URL when it cannot open one). Nothing here reads, stores,
# or types a password or one-time code, and no token is printed. Run it once from WSL; with the
# Automation OU's session policy in place the logins do not expire, and `npm run auth:ensure`
# keeps them usable unattended. The Windows store is enrolled separately by `npm run auth:enroll`.
#
#   bash scripts/auth/enroll.sh                       # pmi-runner@ impersonating the automation SA
#   bash scripts/auth/enroll.sh --attended [--account you@pmikcmetro.com]
set -uo pipefail

ACCOUNT="pmi-runner@pmikcmetro.com"
SERVICE_ACCOUNT="pmi-kc-automation@pmi-kc-kb-prod.iam.gserviceaccount.com"
PROJECT="pmi-kc-kb-prod"
MANAGED_DOMAIN="pmikcmetro.com"
ATTENDED=0
ACCOUNT_SET=0

for arg in "$@"; do
  case "$arg" in
    --attended) ATTENDED=1 ;;
    --account=*) ACCOUNT="${arg#--account=}"; ACCOUNT_SET=1 ;;
    --service-account=*) SERVICE_ACCOUNT="${arg#--service-account=}" ;;
    *) echo "unknown argument: $arg" >&2; exit 1 ;;
  esac
done

ok()   { echo "OK   $*"; }
warn() { echo "..   $*"; }
bad()  { echo "XX   $*"; }

token_mints() {
  CLOUDSDK_CORE_DISABLE_PROMPTS=1 gcloud auth print-access-token >/dev/null 2>&1
}

if ! command -v gcloud >/dev/null 2>&1; then
  bad "gcloud is not on PATH in WSL. Install the Google Cloud SDK, then re-run."
  exit 1
fi

if [ "$ATTENDED" = "1" ]; then
  if [ "$ACCOUNT_SET" = "0" ]; then
    current="$(gcloud config get-value account 2>/dev/null || true)"
    case "$current" in *@"$MANAGED_DOMAIN") ACCOUNT="$current" ;; esac
  fi
  case "$ACCOUNT" in
    *@"$MANAGED_DOMAIN") ;;
    *) bad "Attended enrollment needs a managed account: --account=you@$MANAGED_DOMAIN"; exit 1 ;;
  esac
  SERVICE_ACCOUNT=""
  echo "== Attended enrollment ($ACCOUNT, no impersonation) =="
else
  echo "== Unattended enrollment ($ACCOUNT impersonating $SERVICE_ACCOUNT) =="
fi

# 1. CLI login (interactive only when the account is absent or stale). Without a browser opener,
#    gcloud prints a URL to open on any device and asks for the returned code.
if gcloud auth list --format="value(account)" 2>/dev/null | grep -qi "^${ACCOUNT}$"; then
  gcloud config set account "$ACCOUNT" >/dev/null 2>&1
  ok "$ACCOUNT is in this store and is now the active account."
else
  warn "$ACCOUNT is not signed in here; complete the Google sign-in as $ACCOUNT."
  gcloud auth login "$ACCOUNT" --no-launch-browser
  gcloud config set account "$ACCOUNT" >/dev/null 2>&1
fi

# 2. Impersonation.
if [ -n "$SERVICE_ACCOUNT" ]; then
  gcloud config set auth/impersonate_service_account "$SERVICE_ACCOUNT" >/dev/null 2>&1
  ok "gcloud impersonates $SERVICE_ACCOUNT."
else
  gcloud config unset auth/impersonate_service_account >/dev/null 2>&1
  ok "gcloud impersonation cleared (attended)."
fi

if token_mints; then
  ok "gcloud CLI token mints."
else
  warn "gcloud CLI token did not mint; complete the Google sign-in as $ACCOUNT."
  gcloud auth login "$ACCOUNT" --no-launch-browser
  if ! token_mints; then
    bad "gcloud CLI login did not take. With impersonation configured, the account may lack roles/iam.serviceAccountTokenCreator on the service account (owner IAM step)."
  fi
fi

# 3. Application Default Credentials for the libraries (this shell's own home store).
if [ -n "$SERVICE_ACCOUNT" ]; then
  if node scripts/auth/ensure.mjs --need=adc --unattended --quiet >/dev/null 2>&1; then adc_ok=1; else adc_ok=0; fi
else
  if node scripts/preflight-adc.mjs >/dev/null 2>&1; then adc_ok=1; else adc_ok=0; fi
fi
if [ "$adc_ok" = "1" ]; then
  ok "Application Default Credentials are fresh for this enrollment."
else
  warn "ADC needs the interactive login; sign in as $ACCOUNT (do NOT pass --scopes)."
  if [ -n "$SERVICE_ACCOUNT" ]; then
    gcloud auth application-default login --no-launch-browser --impersonate-service-account="$SERVICE_ACCOUNT"
  else
    gcloud auth application-default login --no-launch-browser
  fi
  gcloud auth application-default set-quota-project "$PROJECT" >/dev/null 2>&1 || true
fi

# 4. Read back through the unattended-safe path and exit with its verdict.
echo
if [ -n "$SERVICE_ACCOUNT" ]; then
  node scripts/auth/ensure.mjs --need=gcloud,adc,env,gh --unattended
else
  node scripts/auth/ensure.mjs --need=gcloud,adc,env,gh
fi
verdict=$?
if [ "$verdict" = "0" ]; then
  echo "READY - this WSL store is enrolled."
else
  echo "NOT READY - resolve the step named above, then re-run bash scripts/auth/enroll.sh"
fi
exit "$verdict"
