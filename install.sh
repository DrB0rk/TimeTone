#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ ! -f "$SCRIPT_DIR/web/package.json" ]; then
  command -v curl >/dev/null 2>&1 || { printf '%s\n' "curl is required for one-command installation." >&2; exit 1; }
  INSTALL_DIR=${TIMETONE_INSTALL_DIR:-"$(pwd)/TimeTone"}
  [ -d "$INSTALL_DIR/web" ] || {
    TMP_DIR=$(mktemp -d)
    trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM
    printf '%s\n' "Downloading the latest TimeTone release…"
    curl -fsSL "https://codeload.github.com/DrB0rk/TimeTone/tar.gz/refs/heads/main?cachebust=$(date +%s)" -o "$TMP_DIR/timetone.tar.gz"
    mkdir -p "$TMP_DIR/source"
    tar -xzf "$TMP_DIR/timetone.tar.gz" -C "$TMP_DIR/source"
    SOURCE_DIR=$(find "$TMP_DIR/source" -mindepth 1 -maxdepth 1 -type d | head -n 1)
    mkdir -p "$INSTALL_DIR"
    cp -R "$SOURCE_DIR"/. "$INSTALL_DIR"/
  }
  # Always refresh the entrypoint, including when a previous failed install
  # already created INSTALL_DIR. This avoids rerunning a stale cached script.
  curl -fsSL "https://raw.githubusercontent.com/DrB0rk/TimeTone/main/install.sh?cachebust=$(date +%s%N)" -o "$INSTALL_DIR/install.sh"
  exec sh "$INSTALL_DIR/install.sh" "$@"
fi
ROOT_DIR=$SCRIPT_DIR
WEB_DIR="$ROOT_DIR/web"
NON_INTERACTIVE=false
FORCE=false
MODE=""
if [ -t 2 ] || [ -r /dev/tty ]; then
  C_RESET=$(printf '\033[0m'); C_BOLD=$(printf '\033[1m'); C_DIM=$(printf '\033[2m'); C_GREEN=$(printf '\033[32m'); C_CYAN=$(printf '\033[36m'); C_YELLOW=$(printf '\033[33m'); C_RED=$(printf '\033[31m'); C_BLUE=$(printf '\033[34m')
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_CYAN=""; C_YELLOW=""; C_RED=""; C_BLUE=""
fi
printf '\n%s%sTimeTone%s  %sOffice time, beautifully tracked.%s\n' "$C_BOLD" "$C_CYAN" "$C_RESET" "$C_DIM" "$C_RESET" >&2
printf '%s────────────────────────────────────────%s\n' "$C_DIM" "$C_RESET" >&2
for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=true ;;
    --native) MODE=native ;;
    --docker) MODE=docker ;;
    --force) FORCE=true ;;
    -h|--help) printf '%s\n' "Usage: ./install.sh [--docker|--native] [--non-interactive] [--force]"; exit 0 ;;
    *) printf '%s\n' "Unknown option: $arg" >&2; exit 1 ;;
  esac
done
[ -f "$WEB_DIR/package.json" ] && [ -f "$WEB_DIR/compose.yaml" ] || { printf '%s\n' "Run this script from a complete TimeTone checkout." >&2; exit 1; }

ask() {
  prompt=$1 default=$2
  if [ "$NON_INTERACTIVE" = true ]; then printf '%s' "$default"; return; fi
  printf '%s [%s]: ' "$prompt" "$default" >&2
  if [ -r /dev/tty ]; then IFS= read -r answer </dev/tty || true; else answer=""; fi
  printf '%s' "${answer:-$default}"
}

[ -n "$MODE" ] || MODE=${TIMETONE_MODE:-}
DEFAULT_MODE=docker
if [ -z "$MODE" ]; then
  if [ "$NON_INTERACTIVE" = true ]; then MODE=docker
  else
    command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 || DEFAULT_MODE=native
    printf '\n%s%sChoose an installation mode%s\n' "$C_BOLD" "$C_BLUE" "$C_RESET" >&2
    printf '  %s[1]%s Docker   %s(recommended for servers)%s\n' "$C_CYAN" "$C_RESET" "$C_DIM" "$C_RESET" >&2
    printf '  %s[2]%s Native   %s(Node.js process, no Docker)%s\n' "$C_CYAN" "$C_RESET" "$C_DIM" "$C_RESET" >&2
    if [ "$DEFAULT_MODE" = docker ]; then DEFAULT_CHOICE=1; else DEFAULT_CHOICE=2; fi
    printf '%sSelection [%s]: %s' "$C_BOLD" "$DEFAULT_CHOICE" "$C_RESET" >&2
    CHOICE=""
    if [ -r /dev/tty ]; then IFS= read -r CHOICE </dev/tty || true; else CHOICE=""; fi
    case "$CHOICE" in
      1|docker|Docker|DOCKER) MODE=docker ;;
      2|native|Native|NATIVE) MODE=native ;;
      "") MODE=$DEFAULT_MODE ;;
      *) printf '%sInvalid selection; using option %s.%s\n' "$C_YELLOW" "$DEFAULT_CHOICE" "$C_RESET" >&2; MODE=$DEFAULT_MODE ;;
    esac
  fi
fi
case "$MODE" in docker|native) ;; *) printf '%s\n' "Unrecognized install mode; using $DEFAULT_MODE." >&2; MODE=$DEFAULT_MODE ;; esac

run_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; elif command -v sudo >/dev/null 2>&1; then sudo "$@"; else printf '%s\n' "This step needs root privileges. Install sudo or rerun as root: $*" >&2; exit 1; fi
}
ensure_base_dependencies() {
  command -v tar >/dev/null 2>&1 && command -v sed >/dev/null 2>&1 && command -v find >/dev/null 2>&1 && return
  if command -v apt-get >/dev/null 2>&1; then
    printf '%s▸%s Installing required system utilities…\n' "$C_GREEN" "$C_RESET"
    run_root apt-get update
    run_root apt-get install -y ca-certificates curl tar sed findutils openssl
  else
    printf '%s\n' "Missing required utilities (tar, sed, find). Install them with your OS package manager and rerun." >&2
    exit 1
  fi
}
ensure_base_dependencies

if [ "$MODE" = docker ]; then
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      printf '%s▸%s Installing Docker Engine and Compose…\n' "$C_GREEN" "$C_RESET"
      run_root apt-get update
      run_root apt-get install -y docker.io docker-compose-v2 || run_root apt-get install -y docker.io docker-compose-plugin
      if command -v systemctl >/dev/null 2>&1; then run_root systemctl enable --now docker || true; fi
    else
      printf '%s\n' "Docker Compose v2 is required. Install Docker Engine and Compose, then rerun." >&2
      exit 1
    fi
  fi
  command -v docker >/dev/null 2>&1 || { printf '%s\n' "Docker installation did not provide the docker command." >&2; exit 1; }
  docker compose version >/dev/null 2>&1 || { printf '%s\n' "Docker Compose v2 is required (docker compose)." >&2; exit 1; }
else
  NODE_OK=false
  if command -v node >/dev/null 2>&1; then node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' >/dev/null 2>&1 && NODE_OK=true; fi
  if [ "$NODE_OK" = false ] || ! command -v npm >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      printf '%s▸%s Installing Node.js 24 and npm…\n' "$C_GREEN" "$C_RESET"
      run_root apt-get update
      run_root apt-get install -y ca-certificates curl
      curl -fsSL https://deb.nodesource.com/setup_24.x | run_root sh
      run_root apt-get install -y nodejs
    else
      printf '%s\n' "Node.js 20.9+ and npm are required. Install them with your OS package manager and rerun." >&2
      exit 1
    fi
  fi
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || { printf '%s\n' "Node.js and npm installation did not complete." >&2; exit 1; }
fi

PORT=${TIMETONE_PORT:-3000}
if [ -f "$WEB_DIR/.env" ] && [ -z "${TIMETONE_PORT:-}" ]; then
  EXISTING_PORT=$(sed -n 's/^TIMETONE_PORT=//p' "$WEB_DIR/.env" | head -n 1)
  [ -n "$EXISTING_PORT" ] && PORT=$EXISTING_PORT
fi

if [ -f "$WEB_DIR/.env" ] && [ "$FORCE" = false ] && [ "$NON_INTERACTIVE" = false ]; then
  printf 'An existing web/.env was found. Replace it? [y/N]: ' >&2
  if [ -r /dev/tty ]; then IFS= read -r replace </dev/tty || true; else replace=""; fi
  case "$replace" in y|Y|yes|YES) ;; *)
    printf '%s\n' "Kept existing configuration. Starting TimeTone…"
    if [ "$MODE" = docker ]; then (cd "$WEB_DIR" && docker compose up -d --build)
    else (cd "$WEB_DIR" && npm run build >/dev/null && PORT="$PORT" nohup npm run start -- --hostname 0.0.0.0 > timetone.log 2>&1 &)
    fi
    exit 0 ;;
  esac
fi

ADMIN_PASSWORD=${TIMETONE_ADMIN_PASSWORD:-}
if [ -z "$ADMIN_PASSWORD" ]; then
  [ "$NON_INTERACTIVE" = false ] || { printf '%s\n' "TIMETONE_ADMIN_PASSWORD is required with --non-interactive." >&2; exit 1; }
  while [ ${#ADMIN_PASSWORD} -lt 8 ]; do
    printf 'Create an admin password (at least 8 characters): ' >&2
    if [ -r /dev/tty ]; then stty -echo </dev/tty; IFS= read -r ADMIN_PASSWORD </dev/tty || true; stty echo </dev/tty; else printf '%s\n' "An interactive terminal is required to create a password. Set TIMETONE_ADMIN_PASSWORD for piped installs without a TTY." >&2; exit 1; fi
    printf '\n' >&2
    [ ${#ADMIN_PASSWORD} -ge 8 ] || printf '%s\n' "Please use at least 8 characters." >&2
  done
fi
PORT=${TIMETONE_PORT:-$(ask "LAN port" "3000")}
TIMEZONE=${TIMEKEEP_TIMEZONE:-$(ask "Office timezone (IANA name)" "Europe/Amsterdam")}
case "$PORT" in *[!0-9]*|'') printf '%s\n' "TIMETONE_PORT must be a number." >&2; exit 1;; esac
if command -v openssl >/dev/null 2>&1; then SECRET=$(openssl rand -hex 32); else SECRET=$(date +%s | sha256sum | awk '{print $1}'); fi
umask 077
if [ "$MODE" = native ]; then mkdir -p "$WEB_DIR/data"; DATABASE_LINE="DATABASE_PATH=$WEB_DIR/data/timekeep.db"; else DATABASE_LINE=""; fi
cat > "$WEB_DIR/.env" <<EOF
# Generated by TimeTone install.sh — keep this file private.
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_SECRET=$SECRET
COOKIE_SECURE=false
TIMEKEEP_TIMEZONE=$TIMEZONE
TIMETONE_PORT=$PORT
$([ "$MODE" = native ] && printf '%s\n' 'TIMETONE_INSTALL_MODE=native' || true)
$DATABASE_LINE
EOF

printf '%s▸%s Installing TimeTone (%s%s%s)…\n' "$C_GREEN" "$C_RESET" "$C_BOLD" "$MODE" "$C_RESET"
if [ "$MODE" = docker ]; then
  (cd "$WEB_DIR" && docker compose config -q && docker compose up -d --build)
else
  (cd "$WEB_DIR" && npm install && npm run build)
  if [ -f "$WEB_DIR/timetone.pid" ] && kill -0 "$(cat "$WEB_DIR/timetone.pid")" 2>/dev/null; then kill "$(cat "$WEB_DIR/timetone.pid")" 2>/dev/null || true; fi
  (cd "$WEB_DIR" && PORT="$PORT" nohup npm run start -- --hostname 0.0.0.0 > timetone.log 2>&1 & echo $! > timetone.pid)
fi
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
printf '\n%s%s✓ TimeTone is ready%s at http://%s:%s\n' "$C_BOLD" "$C_GREEN" "$C_RESET" "${HOST_IP:-localhost}" "$PORT"
[ "$MODE" = native ] && printf '%s\n' "Native logs: $WEB_DIR/timetone.log  |  PID file: $WEB_DIR/timetone.pid"
printf '%s\n' "For browser-based USB updates, serve this address through HTTPS (or use localhost)."
