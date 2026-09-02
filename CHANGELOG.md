# Changelog

All notable TimeTone releases are documented here. Versions follow
[Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

## [0.2.5] - 2026-09-02

- Fix installed-version detection in containerized deployments.
- Make update status resilient across the server restart.

## [0.2.4] - 2026-09-02

- Make software updates installable from the dashboard for native and Docker deployments.
- Add persistent update status, progress stages, and restart feedback.
- Add separate health-check and full-settings sync controls.

## [0.2.3] - 2026-09-02

- Improve terminal connection status visibility with a persistent colored dot.
- Apply local display, power, theme, and server settings without unnecessary restarts.
- Add reliable save result handling and asynchronous color-code submission.

## [0.2.2] - 2026-09-02

- Add animated OTA update progress screen on terminals.

## [0.2.1] - 2026-09-02

- Add animated connecting and syncing state feedback on terminals.
- Keep offline, connecting, syncing, and online states distinct during retries.

## [0.2.0] - 2026-09-02

- Add secure HTTPS OTA firmware updates from approved GitHub release assets.
- Add per-terminal update prompts and update requests in the Devices dashboard.

## [0.1.0] - 2026-08-31

Initial public release.

- ESP32-2432S032 CYD terminal with LVGL touchscreen and four-colour keypad
- Offline event queueing with automatic synchronization
- Employee, device, attendance, audit-event, report, and manual time-entry management
- Configurable rounding, timezone, power, screen, and terminal settings
- Live dashboard updates, dark mode, exports, and USB firmware updates
- Complete workspace migration export/import
