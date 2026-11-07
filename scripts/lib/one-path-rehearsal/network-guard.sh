#!/usr/bin/env bash
# Load the refusal boundary before the wrapper starts any Node helper or emulator CLI. Children
# inherit it. Keep an existing heap bound, including the isolated engineering lane's bound.
enable_rehearsal_network_guard() {
  local workspace="${1:?rehearsal workspace is required}"
  local output="${2:?private output directory is required}"
  local preload="$workspace/tests/browser/renewal-novdec-journey-network.mjs"
  [[ -r "$preload" ]] || { echo "The rehearsal network guard is missing." >&2; return 2; }
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--import=$preload"
  export NOVDEC_JOURNEY_NETWORK_LOG="$output/harness-network.jsonl"
  node --input-type=module -e 'import { Socket } from "node:net"; if (globalThis.fetch?.name !== "guardedFetch" || Socket.prototype.connect.name !== "guardedConnect") throw new Error("The rehearsal network guard is required.");'
}
