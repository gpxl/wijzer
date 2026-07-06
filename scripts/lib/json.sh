#!/usr/bin/env bash
# Shared helpers for wijzer scripts. Dependency-free (bash + coreutils only).
# Sourced by the scripts in scripts/; never executed directly.

# json_escape STRING -> escapes a string for embedding inside JSON double quotes
# (without the surrounding quotes). Handles the characters that realistically
# occur in file paths, git subjects, and reason strings.
json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

# json_str STRING -> a fully-quoted JSON string literal.
json_str() {
  printf '"%s"' "$(json_escape "$1")"
}

# sha256_stream: reads stdin, writes the lowercase hex digest (no filename) to
# stdout. Bridges the macOS (shasum) / Linux (sha256sum) split.
sha256_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}
