#!/usr/bin/env bash
set -euo pipefail

echo "=== onchainos agent --help ==="
onchainos agent --help || true

echo
echo "=== onchainos agent <subcommand> --help (if a service-related subcommand exists) ==="
for sub in add-service update-service set-services service-add services; do
  if onchainos agent "$sub" --help >/dev/null 2>&1; then
    echo "--- onchainos agent $sub --help ---"
    onchainos agent "$sub" --help
  fi
done

echo
echo "=== Searching installed skill docs for 'service' syntax ==="
find ~ -iname "SKILL.md" 2>/dev/null -exec grep -l -i "service" {} \; | while read -r f; do
  echo "--- $f ---"
  grep -i -A3 -B1 "service" "$f" | head -50
done
