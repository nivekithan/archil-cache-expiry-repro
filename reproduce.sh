#!/usr/bin/env bash
set -euo pipefail

readonly READ_SIZE=8192
readonly READS=100
readonly EXPIRY_WAIT_SECONDS=32

if [[ $# -ne 1 ]]; then
  echo "Usage: sudo $0 /mnt/archil/path/to/file" >&2
  exit 2
fi

readonly file=$1
if [[ ! -f $file ]]; then
  echo "Not a regular file: $file" >&2
  exit 2
fi
if (( $(stat -c %s -- "$file") < 65536 )); then
  echo "The test file must be at least 64 KiB" >&2
  exit 2
fi

read_block() {
  dd if="$file" of=/dev/null bs="$READ_SIZE" count=1 \
    iflag=fullblock,nocache status=none
}

measure() {
  local label=$1
  local start_ns end_ns elapsed_ns elapsed_ms
  start_ns=$(date +%s%N)
  for ((read_number = 0; read_number < READS; read_number++)); do
    read_block
  done
  end_ns=$(date +%s%N)
  elapsed_ns=$((end_ns - start_ns))
  elapsed_ms=$((elapsed_ns / 1000000))
  printf '%-38s %6d ms (%d reads)\n' "$label" "$elapsed_ms" "$READS"
}

before_hash=$(sha256sum -- "$file")
echo "$(archil version | head -n 1)"
echo

archil invalidate-cache "$file" >/dev/null
measure "Fresh cache"

echo "Waiting ${EXPIRY_WAIT_SECONDS}s for page expiry..."
sleep "$EXPIRY_WAIT_SECONDS"
measure "After expiry"

archil invalidate-cache "$file" >/dev/null
measure "After explicit invalidation"

after_hash=$(sha256sum -- "$file")
if [[ $before_hash != "$after_hash" ]]; then
  echo "The file changed during the reproduction" >&2
  exit 1
fi

echo
echo "Expected on affected clients: 'After expiry' is substantially slower,"
echo "while explicit invalidation restores the initial timing."
