# TimeTone

TimeTone is a self-hosted, offline-first office time clock for the
**ESP32-2432S032 Cheap Yellow Display (CYD)**. Employees clock in and out by
tapping a four-colour personal code. The accompanying dashboard manages the
team, terminals, time corrections and exportable reports.

<p align="center"><img src="web/public/timetone-mark.svg" width="96" alt="TimeTone logo"></p>

## What you get

- A fast, accessible touchscreen terminal with a four-colour keypad
- Offline queueing: a terminal retains clock events during Wi-Fi or server outages
- Live attendance, employee management, editable time entries and audit events
- Per-device power, screen and sync settings
- CSV exports and exact/rounded-hours reporting
- GitHub release update checks with native in-place updates and Docker redeploy guidance
- Device setup portal, secure per-device credentials and browser USB updates
- A single-container dashboard with SQLite storage and a persistent Docker volume

## Install the dashboard

On a Linux host, install the latest version directly with one command:

```bash
curl -fsSL https://raw.githubusercontent.com/DrB0rk/TimeTone/main/install.sh | sh
```

The script downloads a release checkout into `./TimeTone` and starts the
interactive installer. Set `TIMETONE_INSTALL_DIR` to choose another location.

You can also clone the repository and run the same installer locally:

```bash
git clone https://github.com/DrB0rk/TimeTone.git
cd TimeTone
./install.sh
```

The installer is interactive by default: it asks whether to use Docker or a
native Node.js install, then asks for the admin password, timezone and LAN
port. It creates a private `web/.env` and starts the dashboard. Open the address it prints,
sign in, create employees, and configure the terminal. For unattended installs:

On Debian and Ubuntu it also installs missing host dependencies automatically:
Docker Engine and Compose for Docker mode, or Node.js 24 and npm for native
mode. Other distributions should install those prerequisites with their system
package manager first.

```bash
TIMETONE_ADMIN_PASSWORD='use-a-long-unique-password' \
TIMEKEEP_TIMEZONE='Europe/Amsterdam' TIMETONE_PORT=3000 \
./install.sh --non-interactive
```

To select a mode explicitly, use `./install.sh --docker` or
`./install.sh --native`. Native installs require Node.js 20.9+ and npm; the
dashboard runs as a background process with logs in `web/timetone.log`.

See [deployment and operations](docs/DEPLOYMENT.md) for HTTPS, backups and
updates. An HTTPS address (or `localhost`) is required for browser USB updates
because Web Serial is a secure-context browser feature.

## Set up a terminal

1. Flash a factory-fresh ESP32-2432S032 using the [firmware instructions](firmware/README.md).
2. Join the displayed `TimeTone-XXXX` Wi-Fi network (default password: `timekeep`).
3. Visit `http://192.168.4.1`, enter office Wi-Fi and the dashboard URL.
4. Approve the new terminal from **Devices** in the dashboard.
5. Create employees and assign their four-colour codes in **Employees**.

Terminals automatically fall back to their setup Wi-Fi when saved Wi-Fi cannot
be joined. Keep the initial setup network physically controlled; it is intended
for provisioning rather than general office Wi-Fi access.

## Repository layout

- `firmware/` — ESP-IDF 6 + LVGL firmware for the CYD
- `web/` — Next.js dashboard, REST API, and SQLite-backed server
- `docs/` — hardware, API, operations, and deployment documentation

## Development

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

The dashboard has no demo employees or devices by default. The development
password is only the value in your local `web/.env`; set a unique password and
secret before exposing it to a network.

See [Getting started](docs/GETTING_STARTED.md), [hardware](docs/HARDWARE.md),
[deployment](docs/DEPLOYMENT.md), and the [device API](docs/API.md).

## Support and security

Please read [the security guidance](docs/DEPLOYMENT.md#security-checklist)
before exposing TimeTone beyond a trusted LAN. File product issues in this
repository; do not include credentials, employee data or device tokens in
public issues.
