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
# npm run from PowerShell reaches this script through a non-login WSL bash whose PATH has no Node.
# Reuse the login shell's PATH; this touches no credential, identity, store or policy.
if ! command -v node >/dev/null 2>&1; then
  login_path="$(bash -lc 'printf %s "$PATH"' </dev/null 2>/dev/null || true)"
  [[ -n "$login_path" ]] && export PATH="$login_path:$PATH"
fi
command -v node >/dev/null || { echo "NOT READY: Node is missing from the WSL login PATH." >&2; exit 2; }
# The checks below load this checkout's installed packages and check its .env.local. A checkout
# without them (a Windows worktree, or an emptied node_modules) continues in the registered WSL
# checkout that pmi-auth uses, before any Google prompt or local config change. Enrollment itself is
# unchanged.
auth_root="$(node scripts/auth/checkout-dependencies.mjs </dev/null)" || exit 2
if [[ "$auth_root" != "$(pwd -P)" ]]; then
  echo "This checkout lacks installed packages or its own .env.local; continuing in the registered WSL checkout $auth_root."
  cd -- "$auth_root"
  exec bash scripts/auth/enroll.sh "$@"
fi
# Windows npm reaches this script through the WSL interop relay, which gives Google's code prompt no
# terminal input, so that launch path uses Google's browser callback through the default Windows browser.
parent_command="$(cat "/proc/$PPID/comm" 2>/dev/null || true)"
if [[ "$parent_command" == Relay* && "$PMI_ENROLL_BROWSER" == 0 ]]; then
  PMI_ENROLL_BROWSER=1
  echo "Windows started this enrollment; Google's browser callback replaces the code prompt."
fi
if [[ "$PMI_ENROLL_BROWSER" == 1 && -z "${BROWSER:-}" && -x /mnt/c/Windows/System32/rundll32.exe ]]; then
  export BROWSER="$PWD/scripts/auth/open-windows-browser.sh"
fi

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

# ensure.mjs exits 2 when a credential needs a person and 0 when it is ready. Any other result means
# the check itself did not run, so stop instead of asking for a sign-in it cannot verify.
needs_google_signin() {
  local status=0 output
  output="$(node scripts/auth/ensure.mjs --need="$1" --quiet </dev/null 2>&1)" || status=$?
  [[ "$status" -eq 0 ]] && return 1
  [[ "$status" -eq 2 ]] && return 0
  [[ -n "$output" ]] && printf '%s\n' "$output" >&2
  echo "NOT READY: the Google $2 check could not run (exit $status); enrollment stopped before any sign-in." >&2
  exit 1
}

echo "Checking existing WSL sign-in as $PMI_LOCAL_ACCOUNT. These checks can take a few minutes."
echo "Wait for a NEW Google link before entering anything."
# These local config changes are part of explicit owner enrollment, never the status/preflight path.
gcloud config set account "$PMI_LOCAL_ACCOUNT" </dev/null >/dev/null 2>&1
gcloud config unset auth/impersonate_service_account </dev/null >/dev/null 2>&1
echo "Checking Google CLI credentials..."
if needs_google_signin gcloud CLI; then
  enroll_google CLI auth login "$PMI_LOCAL_ACCOUNT"
  echo "Verifying Google CLI sign-in..."
  node scripts/auth/ensure.mjs --need=gcloud --quiet </dev/null
fi
echo "Checking Google ADC credentials..."
if needs_google_signin adc ADC; then
  enroll_google ADC auth application-default login --account="$PMI_LOCAL_ACCOUNT"
  echo "Verifying the Google account and binding this ADC enrollment..."
  node scripts/auth/verify-enrollment.mjs </dev/null
fi
echo "Checking final CLI and ADC readiness..."
node scripts/auth/ensure.mjs --need=gcloud,adc,env,gh --unattended </dev/null
