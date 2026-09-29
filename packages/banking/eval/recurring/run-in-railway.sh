#!/usr/bin/env bash
# Exports ramnn's production history, anonymized, for the recurring replay
# (`bun run eval:recurring`). Bundles export-ramnn.ts into one file, runs it
# in ramnn's API container over `railway ssh` (read-only transaction,
# anonymized there), and decodes what it prints into data/ramnn-prod.json,
# which git ignores: the repository is public.
#
#   packages/banking/eval/recurring/run-in-railway.sh [ramnn repo, linked to Railway]
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
ramnn="${1:-$here/../../../../../ramnn}"
service="${RAMNN_SERVICE:-ramnn-api}"
out="$here/data/ramnn-prod.json"
mkdir -p "$here/data"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

bun build "$here/export-ramnn.ts" --target=bun --outfile="$work/export.js" >/dev/null
payload="$(base64 < "$work/export.js" | tr -d '\n')"

echo "Running the export in $service (read-only)..." >&2
(
  cd "$ramnn"
  railway ssh --service "$service" \
    "echo $payload | base64 -d > /tmp/keel-export.js && bun /tmp/keel-export.js; code=\$?; rm -f /tmp/keel-export.js; exit \$code"
) > "$work/raw.txt"

sed -n '/KEEL-EXPORT-BEGIN/,/KEEL-EXPORT-END/p' "$work/raw.txt" \
  | tr -d '\r' \
  | sed '1d;$d' \
  | base64 --decode \
  | gunzip > "$out"

echo "Written: $out ($(wc -c < "$out" | tr -d ' ') bytes)" >&2
