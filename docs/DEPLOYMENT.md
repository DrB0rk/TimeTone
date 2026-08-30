# Deploying and operating TimeTone

## Recommended install

From a trusted release checkout on a Linux Docker host:

```bash
./install.sh
```

The script creates `web/.env` with a random 256-bit session secret and starts
the dashboard. It never sends configuration or attendance data outside your
host. Re-run it to rebuild after pulling an update; choose to keep the existing
configuration when prompted.

## Docker Compose

```bash
cd web
cp .env.example .env
# Set ADMIN_PASSWORD, ADMIN_SECRET and TIMEKEEP_TIMEZONE.
# Keep COOKIE_SECURE=false for plain HTTP on a trusted LAN; set it true once
# the application is available through HTTPS.
# Then:
docker compose up -d --build
```

The named `timekeep-data` volume contains the SQLite database. Put the service
behind a TLS reverse proxy such as Caddy, nginx, or Traefik before exposing it
beyond a trusted LAN. Web Serial firmware updates require a secure browser
context, which means HTTPS or `localhost`. The ESP firmware uses the standard
certificate bundle and expects a publicly trusted HTTPS certificate in
production.

## Backup

SQLite uses WAL mode. Use SQLite's online backup command instead of copying a
busy database file:

```bash
docker compose exec timekeep sqlite3 /data/timekeep.db \
  ".backup '/data/timekeep-backup.db'"
```

Copy the backup out of the volume and test restoration periodically.

To restore, stop TimeTone, replace `/data/timekeep.db` from a tested backup,
remove any matching `-wal`/`-shm` sidecar files, and start the service again.
Keep an encrypted, off-host backup; the database contains attendance data.

## Security checklist

- Replace the development admin password and session secret. Employee color
  sequences are created in the protected web UI.
- Do not share `web/.env` or the Docker volume. The application creates a
  separate device credential during terminal pairing.
- Terminate TLS before exposing the app or configuring an ESP.
- Restrict dashboard access with a VPN or identity-aware proxy when practical.
- Protect backups: they contain employee names, attendance, and email addresses.
- Review manual corrections and CSV exports as personal data under applicable
  employment and privacy law.

## Updating

To update the dashboard, pull the desired TimeTone revision and re-run the
installer (or run `docker compose up -d --build` in `web/`). Docker preserves
the named database volume.

### Updating firmware

Use **Devices → USB firmware update** in a supported browser. Select the
`timetone.bin` application image from a compatible release/build; existing
terminal configuration is preserved. The partition table also contains two
1.8 MiB OTA slots, but TimeTone currently ships operator-initiated USB updates
rather than unattended OTA rollouts.
