#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
allowlist_file="$repository_root/security/govulncheck-allowlist.txt"
report_file="$(mktemp)"
findings_file="$(mktemp)"
allowed_file="$(mktemp)"

cleanup() {
  rm -f "$report_file" "$findings_file" "$allowed_file"
}
trap cleanup EXIT

cd "$repository_root/core"

set +e
govulncheck -json ./cmd/docker > "$report_file"
scan_status=$?
set -e

if [[ $scan_status -ne 0 && $scan_status -ne 3 ]]; then
  echo "govulncheck failed with status $scan_status" >&2
  exit "$scan_status"
fi

# A one-element trace is a module/package presence finding. Longer traces are
# symbols reachable from the shipping cmd/docker binary and must be reviewed.
jq -r 'select(.finding and (.finding.trace | length) > 1) | .finding.osv' \
  "$report_file" | sort -u > "$findings_file"
sed -E '/^[[:space:]]*(#|$)/d' "$allowlist_file" | sort -u > "$allowed_file"

unexpected="$(comm -23 "$findings_file" "$allowed_file")"
stale="$(comm -13 "$findings_file" "$allowed_file")"

if [[ -n "$unexpected" ]]; then
  echo "Unexpected reachable Go vulnerabilities:" >&2
  echo "$unexpected" >&2
  exit 1
fi

if [[ -n "$stale" ]]; then
  echo "Resolved or unreachable allowlist entries must be removed:" >&2
  echo "$stale" >&2
  exit 1
fi

if [[ -s "$findings_file" ]]; then
  echo "Only reviewed, currently-unfixed Moby findings remain:"
  cat "$findings_file"
else
  echo "No reachable Go vulnerabilities found."
fi
