#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:5174}"
STATS_ADMIN_TOKEN="${STATS_ADMIN_TOKEN:-}"

print_usage() {
  cat <<'EOF'
Usage:
  admin-stats.sh <overview|runs|names|daily> [key=value ...]

Environment:
  BASE_URL            Admin API host. Default: http://127.0.0.1:5174
  STATS_ADMIN_TOKEN   Required bearer token for /api/admin/stats/*

Examples:
  STATS_ADMIN_TOKEN=... admin-stats.sh overview
  STATS_ADMIN_TOKEN=... admin-stats.sh runs limit=25
  STATS_ADMIN_TOKEN=... admin-stats.sh runs playerName=Dimitri championUpdated=true limit=10
  STATS_ADMIN_TOKEN=... admin-stats.sh daily from=2026-03-08T00:00:00.000Z limit=7
EOF
}

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ "${1:-}" == "" || "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  print_usage
  exit 0
fi

endpoint="$1"
shift

case "$endpoint" in
  overview|runs|names|daily)
    ;;
  *)
    echo "Unknown endpoint: $endpoint" >&2
    print_usage >&2
    exit 1
    ;;
esac

if [[ -z "$STATS_ADMIN_TOKEN" ]]; then
  echo "STATS_ADMIN_TOKEN is required." >&2
  exit 1
fi

curl_args=(
  --silent
  --show-error
  --fail-with-body
  --get
  --header "Authorization: Bearer $STATS_ADMIN_TOKEN"
)

for pair in "$@"; do
  if [[ "$pair" != *=* ]]; then
    echo "Expected query args as key=value, got: $pair" >&2
    exit 1
  fi
  key="${pair%%=*}"
  value="${pair#*=}"
  curl_args+=(--data-urlencode "$key=$value")
done

response="$(curl "${curl_args[@]}" "$BASE_URL/api/admin/stats/$endpoint")"

if command -v jq >/dev/null 2>&1; then
  printf '%s\n' "$response" | jq .
else
  printf '%s\n' "$response"
fi
