#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# TubeFilter — end-to-end test runner
#
# Boots a local static server, opens tests/harness.html via playwright-cli,
# runs all assertions and prints a PASS/FAIL summary.
#
# Requires: playwright-cli, python3.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${TUBEFILTER_TEST_PORT:-8765}"
SESSION="${TUBEFILTER_TEST_SESSION:-tubefilter-test}"
URL="http://127.0.0.1:${PORT}/tests/harness.html"
TMP_DIR="$(mktemp -d -t tubefilter-tests.XXXXXX)"
RESULT_FILE="$TMP_DIR/result.json"
SERVER_LOG="$TMP_DIR/server.log"

cleanup() {
  local code=$?
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  playwright-cli -s="$SESSION" close >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
  exit "$code"
}
trap cleanup EXIT INT TERM

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "✘ missing dependency: $1" >&2
    exit 2
  }
}
require playwright-cli
require python3

cd "$ROOT"

# Don't fight an existing instance on the port.
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "✘ port ${PORT} already in use" >&2
  exit 2
fi

echo "▶ starting static server on :${PORT}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

# Wait until the server accepts connections (max ~5s).
for _ in {1..50}; do
  if curl -fs "http://127.0.0.1:${PORT}/manifest.json" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

echo "▶ opening harness in playwright"
playwright-cli -s="$SESSION" close >/dev/null 2>&1 || true
playwright-cli -s="$SESSION" open --browser=chrome "$URL" >/dev/null

echo "▶ running assertions"
# Use a small JS function that writes the JSON-string result to a global,
# then read it via a second eval. This dodges any shell-quoting issues that
# would otherwise be needed to round-trip a JSON-of-JSON string.
playwright-cli -s="$SESSION" eval \
  "async () => { const r = await runAll(); window.__lastResult = JSON.stringify(r); return 'ok'; }" \
  >/dev/null

# Read the JSON back. playwright-cli wraps the value in markdown sections:
#   ### Result
#   "..."          <-- our JSON-encoded string
#   ### Ran Playwright code
#   ...
RAW_OUTPUT="$(playwright-cli -s="$SESSION" eval "() => window.__lastResult")"
printf '%s' "$RAW_OUTPUT" > "$TMP_DIR/raw.txt"

python3 - "$TMP_DIR/raw.txt" "$RESULT_FILE" <<'PY'
import json, re, sys
with open(sys.argv[1]) as f:
    raw = f.read()
# Slice from "### Result" line down to (but excluding) the next "###" header.
m = re.search(r'### Result\s*\n(.*?)\n###', raw, flags=re.S)
if not m:
    sys.exit("could not parse playwright-cli output")
quoted = m.group(1).strip()
# `quoted` is a JSON-encoded string; decode it once to get our JSON.
inner = json.loads(quoted)
data = json.loads(inner)
with open(sys.argv[2], 'w') as f:
    json.dump(data, f)
PY

python3 - "$RESULT_FILE" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
for t in d["details"]:
    mark = "✔" if t["ok"] else "✘"
    print(f"  {mark} {t['name']}")
    if not t["ok"]:
        print(f"     want: {t['want']}")
        print(f"     got:  {t['got']}")
print()
print(("✅" if d["passed"] == d["total"] else "❌") +
      f" {d['passed']}/{d['total']} tests passed")
sys.exit(0 if d["passed"] == d["total"] else 1)
PY
