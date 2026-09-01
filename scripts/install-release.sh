#!/usr/bin/env sh
set -eu

CURRENT_ROOT=${1:?current install root required}
STAGE=${2:?staging directory required}
TAG=${3:?release tag required}
ARCHIVE="$STAGE/release.tar.gz"
EXTRACTED="$STAGE/source"
mkdir -p "$EXTRACTED"
tar -xzf "$ARCHIVE" -C "$EXTRACTED"
SOURCE=$(find "$EXTRACTED" -mindepth 1 -maxdepth 1 -type d | head -n 1)
[ -n "$SOURCE" ] || { echo "Release archive contained no source directory" >&2; exit 1; }
cp "$CURRENT_ROOT/web/.env" "$SOURCE/web/.env"
sed -i "s#^DATABASE_PATH=.*#DATABASE_PATH=$CURRENT_ROOT/web/data/timekeep.db#" "$SOURCE/web/.env"
rm -rf "$SOURCE/web/data" "$SOURCE/web/node_modules" "$SOURCE/web/.next"
mkdir -p "$SOURCE/web/data"
if [ -d "$CURRENT_ROOT/web/data" ]; then cp -a "$CURRENT_ROOT/web/data/." "$SOURCE/web/data/"; fi
(cd "$SOURCE/web" && npm install && npm run build)
OLD_PID=""
if [ -f "$CURRENT_ROOT/web/timetone.pid" ]; then OLD_PID=$(cat "$CURRENT_ROOT/web/timetone.pid" 2>/dev/null || true); fi
if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then kill "$OLD_PID" 2>/dev/null || true; fi
mv "$CURRENT_ROOT" "${CURRENT_ROOT}.previous-$TAG"
mv "$SOURCE" "$CURRENT_ROOT"
(cd "$CURRENT_ROOT/web" && PORT=$(grep '^TIMETONE_PORT=' .env | cut -d= -f2 || printf '3000') nohup npm run start -- --hostname 0.0.0.0 > timetone.log 2>&1 & echo $! > timetone.pid)
rm -rf "$STAGE"
