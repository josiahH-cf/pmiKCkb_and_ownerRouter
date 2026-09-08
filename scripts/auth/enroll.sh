#!/usr/bin/env bash
# Interactive recovery for both WSL CLI and ADC. Only the owner completes Google's sign-in.
# No IAM, claims, account creation, session-policy changes, or credential copying occurs here.
set -euo pipefail
PMI_LOCAL_ACCOUNT="josiah@pmikcmetro.com"
PMI_ENROLL_BROWSER=0
for arg in "$@"; do
  case "$arg" in
    --attended) ;; # Familiar spelling retained; this exact account also serves local unattended work.
    --account=josiah@pmikcmetro.com) ;;
    --browser) PMI_ENROLL_BROWSER=1 ;;
    *) echo "Unsupported enrollment option or identity." >&2; exit 2 ;;
  esac
done
if [[ "$(uname -s)" != "Linux" ]] || ! rg -qi 'microsoft|wsl' /proc/version; then
  echo "NOT READY: run this command in WSL." >&2; exit 2
fi
if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" || -n "${CLOUDSDK_CONFIG:-}" || -n "${CLOUDSDK_AUTH_ACCESS_TOKEN:-}" || -n "${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE:-}" ]]; then
  echo "NOT READY: unset credential-file, token and store overrides before WSL enrollment." >&2; exit 2
fi
command -v gcloud >/dev/null || { echo "NOT READY: gcloud is missing from WSL PATH."; exit 2; }

enroll_google() {
  local credential="$1"
  shift
  echo
  echo "Complete Google $credential sign-in as $PMI_LOCAL_ACCOUNT."
  local browser_flag=--no-launch-browser
  if [[ "$PMI_ENROLL_BROWSER" == 1 ]]; then
    browser_flag=--launch-browser
    echo "Keep this command running and complete sign-in at the NEW Google link below."
    echo "Google's browser callback returns directly to this command; no code copying is needed."
  else
    echo "Keep this command running. Open only the NEW Google link printed below."
    echo "Wait for Google's verification-code prompt, then paste that link's code there and press Enter once."
    echo "Codes from older or cancelled attempts will not work. Enter the code only in this terminal."
  fi
  local result=0
  gcloud "$@" "$browser_flag" || result=$?
  if [[ "$result" -ne 0 ]]; then
    echo >&2
    echo "Google $credential sign-in did not complete; enrollment has stopped." >&2
    if [[ "$PMI_ENROLL_BROWSER" == 1 ]]; then
      echo "Run npm run auth:session -- --browser again and open its fresh link with the same running command." >&2
    else
      echo "Run npm run auth:session again and use its fresh link and code in the same running command." >&2
    fi
    return "$result"
  fi
}

echo "Checking existing WSL sign-in as $PMI_LOCAL_ACCOUNT. These checks can take a few minutes."
echo "Wait for a NEW Google link before entering anything."
# These local config changes are part of explicit owner enrollment, never the status/preflight path.
gcloud config set account "$PMI_LOCAL_ACCOUNT" </dev/null >/dev/null 2>&1
gcloud config unset auth/impersonate_service_account </dev/null >/dev/null 2>&1
echo "Checking Google CLI credentials..."
if ! node scripts/auth/ensure.mjs --need=gcloud --quiet </dev/null >/dev/null 2>&1; then
  enroll_google CLI auth login "$PMI_LOCAL_ACCOUNT"
  echo "Verifying Google CLI sign-in..."
  node scripts/auth/ensure.mjs --need=gcloud --quiet </dev/null
fi
echo "Checking Google ADC credentials..."
if ! node scripts/auth/ensure.mjs --need=adc --quiet </dev/null >/dev/null 2>&1; then
  enroll_google ADC auth application-default login --account="$PMI_LOCAL_ACCOUNT"
  echo "Verifying the Google account and binding this ADC enrollment..."
  node scripts/auth/verify-enrollment.mjs </dev/null
fi
echo "Checking final CLI and ADC readiness..."
node scripts/auth/ensure.mjs --need=gcloud,adc,env,gh --unattended </dev/null
