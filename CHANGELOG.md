# Changelog

All notable TimeTone releases are documented here. Versions follow
[Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

## [0.2.12] - 2026-09-02

- Overhaul terminal connection recovery, startup authentication, and full-sync scheduling.
- Keep Wi-Fi reconnection active while the fallback configuration portal is available.
- Prevent routine health checks and successful clock-ins from triggering disruptive full syncs.
- Add bounded HTTPS timeouts, HTTP keep-alive, device request identification, and retry throttling.
- Force dynamic, no-cache device API responses.

## [0.2.11] - 2026-09-02

- Harden dashboard software updates with install-root discovery and actionable API errors.
- Prevent update requests from surfacing as opaque proxy errors.

## [0.2.10] - 2026-09-02

- Remove browser USB firmware flashing from the dashboard.
- Manage terminal firmware updates from the Devices page through explicit OTA requests.
- Keep firmware downloads and installation terminal-controlled after an administrator starts an update.

## [0.2.9] - 2026-09-02

- Fix native in-place updates to replace the compiled web bundle instead of serving stale UI assets.

## [0.2.8] - 2026-09-02

- Speed up terminal startup by making health checks independent from full configuration downloads.
- Trigger a full employee/settings refresh after wake or with the new Sync now controls.
- Improve Wi-Fi fast-scan and connection stability settings.
- Add a clearer terminal settings layout and manual sync action.
- Add a visible sidebar version and GitHub feedback link.
- Publish a prebuilt production web bundle for native installs.

## [0.2.7] - 2026-09-02

- Complete a dashboard UI/UX consistency pass across light and dark themes.
- Fix public asset routing so the TimeTone logo loads before authentication.
- Improve overview copy for singular attendance and add a reproducible demo fixture.
- Add polished README screenshots for the overview, reports, employees, and devices pages.

## [0.2.6] - 2026-09-02

- Confirm Docker update completion after the old container is replaced.

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
