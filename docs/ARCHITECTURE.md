# Architecture

The ESP32 is an offline-first terminal. It stores Wi-Fi and server settings in
NVS, caches the employee directory, keeps an append-only queue of unsynchronised
clock events, and uses SNTP when a network is available. Entering an employee
code toggles that employee between clocked in and clocked out.

The web application is both the administration UI and device API. Devices use a
per-device bearer token to download their configuration, send idempotent clock
events, and report health. The server stores raw events and derives sessions and
rounded totals. Raw timestamps are retained so rounding rules can be changed
without losing information.

Time is rounded to 15 minutes per completed session by default. The rounding
policy is server-configurable and totals retain both exact and rounded minutes.

