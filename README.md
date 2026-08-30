# ESP Timekeep

ESP Timekeep is an offline-first office time clock for the ESP32-2432S028R
"Cheap Yellow Display" (CYD). Employees clock in and out with a personal code
on the touchscreen. A companion web application manages employees and devices,
shows live attendance, and reports rounded working time.

## Repository layout

- `firmware/` — ESP-IDF 6 + LVGL firmware for the CYD
- `web/` — Next.js dashboard, REST API, and SQLite-backed server
- `docs/` — hardware, API, operations, and deployment documentation

## Quick start

```bash
# Web application
cd web
cp .env.example .env
deno install --allow-scripts=npm:better-sqlite3
npm run dev

# Firmware (in another shell)
cd firmware
source /home/drb0rk/.espressif/v6.0.1/esp-idf/export.sh
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

On a factory-fresh terminal, join the `ESP-Timekeep-XXXX` Wi-Fi network with
password `timekeep`, open `http://192.168.4.1`, and enter Wi-Fi, server URL, and
the device token. The local demo dashboard password is `timekeep`; employee
Alex Morgan uses PIN `1234`. Change every demo credential before deployment.

See [Getting started](docs/GETTING_STARTED.md), [hardware](docs/HARDWARE.md),
[deployment](docs/DEPLOYMENT.md), and the [device API](docs/API.md).

## Current product features

- Touchscreen PIN clock-in/out with clear employee feedback
- Offline employee cache and a persistent 48-event sync queue
- Wi-Fi setup portal plus automatic fallback access point
- HTTPS device API, per-device bearer tokens, idempotent events, and heartbeat
- Admin login, employee/device management, live attendance, correction entry
- Exact and independently rounded totals, configurable policy, CSV export
- SQLite WAL storage, Docker deployment, persistent volumes, and health checks
- Dual OTA-ready application partitions and semver firmware reporting

