# Getting started

## 1. Run the server

The web application requires Node.js 24 and uses Deno for the checked-in lock
file in this development environment.

```bash
cd web
cp .env.example .env
```

Set secure values in `.env`. `ADMIN_SECRET` should contain at least 32 random
bytes and each device token should be unique. Then run:

```bash
deno install --allow-scripts=npm:better-sqlite3
npm run dev
```

Open `http://localhost:3000`. The development defaults are admin password
The server starts without demo employees or devices. Add an employee and choose
a color sequence in **Employees**, then approve the terminal in **Devices**.

## 2. Build and flash the terminal

```bash
cd firmware
source /home/drb0rk/.espressif/v6.0.1/esp-idf/export.sh
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

Find a different serial port with `python -m serial.tools.list_ports` when
necessary. On Linux, the account may need membership of the `uucp` or `dialout`
group depending on the distribution.

## 3. Provision it

After first boot the display shows the setup SSID. Join
`ESP-Timekeep-XXXX` using password `timekeep`, then browse to
`http://192.168.4.1`. Enter:

- the office 2.4 GHz Wi-Fi network;
- the externally reachable server URL, without a trailing slash;
- the same device token registered in the dashboard.

The board restarts, synchronises time and employees, and enables the keypad.
If the saved Wi-Fi is unavailable for 20 seconds, the setup network returns.

## 4. Clock time

Choose a 4–8 color sequence and tap **DONE**. The same action toggles between clock-in
and clock-out. The event is stored before sync, so a short server or Wi-Fi
outage does not lose it. The dashboard calculates rounded time per completed
session while retaining exact timestamps.

## Verification commands

```bash
cd web
npm test
npm run lint
npm run build

cd ../firmware
idf.py build
```
