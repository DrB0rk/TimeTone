#!/usr/bin/env sh
set -eu

CURRENT_ROOT=${1:?current install root required}
STAGE=${2:?staging directory required}
TAG=${3:?release tag required}
ARCHIVE="$STAGE/release.tar.gz"
EXTRACTED="$STAGE/source"
STATUS_FILE=${TIMETONE_UPDATE_STATUS:-$CURRENT_ROOT/web/data/update-status.json}
write_status() {
  mkdir -p "$(dirname "$STATUS_FILE")"
  printf '{"status":"%s","message":"%s","version":"%s","updatedAt":"%s"}\n' "$1" "$2" "$TAG" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_FILE"
}
trap 'write_status error "Docker update failed"' EXIT
write_status preparing "Preparing TimeTone $TAG"
mkdir -p "$EXTRACTED"
tar -xzf "$ARCHIVE" -C "$EXTRACTED"
SOURCE=$(find "$EXTRACTED" -mindepth 1 -maxdepth 1 -type d | head -n 1)
[ -n "$SOURCE" ] || { echo "Release archive contained no source directory" >&2; exit 1; }
[ -f "$CURRENT_ROOT/web/.env" ] && cp "$CURRENT_ROOT/web/.env" "$SOURCE/web/.env"
rm -rf "$SOURCE/web/data" "$SOURCE/web/node_modules" "$SOURCE/web/.next"
write_status building "Building Docker image for TimeTone $TAG"
# Preserve the checked-out install directory and persistent named volume while
# replacing the application source used by the compose project.
cp -a "$SOURCE"/. "$CURRENT_ROOT"/
write_status restarting "Restarting the TimeTone Docker service"
(cd "$CURRENT_ROOT/web" && docker compose up -d --build)
trap - EXIT
write_status complete "TimeTone $TAG is ready"
rm -rf "$STAGE"
