# ESP Timekeep

ESP Timekeep is an offline-first office time clock for the ESP32-2432S028R
"Cheap Yellow Display" (CYD). Employees clock in and out with a personal code
on the touchscreen. A companion web application manages employees and devices,
shows live attendance, and reports rounded working time.

## Repository layout

- `firmware/` — ESP-IDF 6 + LVGL firmware for the CYD
- `web/` — Next.js dashboard, REST API, and SQLite-backed server
- `docs/` — hardware, API, operations, and deployment documentation

The project is under active development. See the documentation in `docs/` for
setup and operating instructions.

