#!/bin/sh
# Skillbase installer.
#
#   curl -fsSL https://raw.githubusercontent.com/HackathonTranposeFromJapan/Skillbase/main/install.sh | sh
#
# Downloads a single ~60 KB file that runs on plain Node 18+, puts it on PATH,
# and wires the telemetry hooks into whichever agents are installed.
#
# POSIX sh on purpose: this is the first thing a new user runs, and it should
# not depend on bash, npm, Bun, or this repository being cloned.

set -eu

RAW="https://raw.githubusercontent.com/HackathonTranposeFromJapan/Skillbase/main/packages/cli/dist/skillbase.js"
BIN_NAME="skillbase"

RUN_INIT=1
# `while [ $# -gt 0 ]` rather than `for arg in "$@"`: bash 3.2 — still the
# default /bin/sh on macOS — can treat an empty "$@" as an unbound variable
# under `set -u`, which would abort before printing anything.
while [ $# -gt 0 ]; do
  case "$1" in
    --no-init) RUN_INIT=0 ;;
    --dir=*)   INSTALL_DIR="${1#--dir=}" ;;
  esac
  shift
done

say()  { printf '%s\n' "$*"; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- node ------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  die "Node 18+ is required but 'node' was not found on PATH.
  Install Node from https://nodejs.org and run this again."
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node 18+ is required (found $(node -v))."
fi

# --- where to put it -------------------------------------------------------
# Prefer a user-writable location so the installer never needs sudo.
if [ -z "${INSTALL_DIR:-}" ]; then
  if [ -w "/usr/local/bin" ] && [ -d "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
  else
    INSTALL_DIR="$HOME/.local/bin"
  fi
fi
mkdir -p "$INSTALL_DIR" || die "cannot create $INSTALL_DIR"

TARGET="$INSTALL_DIR/$BIN_NAME"

# BSD `mktemp` — macOS, where most of this audience is — requires a template;
# only GNU coreutils accepts a bare `mktemp`. Calling it with no argument made
# the installer abort on every Mac, installing nothing.
TMP="$(mktemp "${TMPDIR:-/tmp}/skillbase.XXXXXX" 2>/dev/null)" ||
  TMP="${TMPDIR:-/tmp}/skillbase.$$"
: > "$TMP" || die "cannot create a temporary file in ${TMPDIR:-/tmp}"
trap 'rm -f "$TMP"' EXIT INT TERM

# --- download --------------------------------------------------------------
say "downloading skillbase..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$RAW" -o "$TMP" || die "download failed from $RAW"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP" "$RAW" || die "download failed from $RAW"
else
  die "neither curl nor wget is available"
fi

# A truncated or error-page download must not be installed and then fail
# mysteriously on first run.
if [ ! -s "$TMP" ]; then
  die "downloaded file is empty"
fi
if ! head -n 1 "$TMP" | grep -q '^#!/usr/bin/env node'; then
  die "downloaded file does not look like the skillbase CLI"
fi

mv "$TMP" "$TARGET"
# Explicit mode rather than `chmod +x`, which applies the umask and on some
# systems leaves the file unreadable to anyone but the owner.
chmod 755 "$TARGET"
trap - EXIT INT TERM

say "installed $TARGET"

# --- PATH ------------------------------------------------------------------
# Whether `skillbase` is callable by name decides whether the next command a
# user types does anything at all, so this is stated plainly and every follow-up
# command below is printed as an absolute path that works regardless.
ON_PATH=0
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ON_PATH=1 ;;
esac

CMD="$TARGET"
[ "$ON_PATH" -eq 1 ] && CMD="$BIN_NAME"

# --- wire it up ------------------------------------------------------------
if [ "$RUN_INIT" -eq 1 ]; then
  "$TARGET" init || say "init did not complete; run '$CMD init' yourself."
fi

say ""
say "next — see the skill usage you already have (nothing is uploaded):"
say "  $CMD backfill claude --dry-run"

if [ "$ON_PATH" -eq 0 ]; then
  say ""
  say "note: $INSTALL_DIR is not on your PATH, so typing '$BIN_NAME' will not work"
  say "      until you add it:"
  say "  export PATH=\"$INSTALL_DIR:\$PATH\""
fi
