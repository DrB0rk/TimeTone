# Deployment and operations

## Docker Compose

```bash
cd web
cp .env.example .env
# Edit every value. Keep COOKIE_SECURE=false for plain HTTP on a trusted LAN;
# set COOKIE_SECURE=true when the app is behind an HTTPS reverse proxy.
# Then:
docker compose up -d --build
```

The named `timekeep-data` volume contains the SQLite database. Put the service
behind a TLS reverse proxy such as Caddy, nginx, or Traefik. The ESP firmware
uses the standard certificate bundle and expects a publicly trusted HTTPS
certificate in production.

## Backup

SQLite uses WAL mode. Use SQLite's online backup command instead of copying a
busy database file:

```bash
docker compose exec timekeep sqlite3 /data/timekeep.db \
  ".backup '/data/timekeep-backup.db'"
```

Copy the backup out of the volume and test restoration periodically.

## Security checklist

- Replace the development admin password and session secret. Employee color
  sequences are created in the protected web UI.
- Give each physical terminal a different random token.
- Terminate TLS before exposing the app or configuring an ESP.
- Restrict dashboard access with a VPN or identity-aware proxy when practical.
- Protect backups: they contain employee names, attendance, and email addresses.
- Review manual corrections and CSV exports as personal data under applicable
  employment and privacy law.

## Updating firmware

The partition table contains two 1.8 MiB OTA slots. Version 0.1.0 reports its
version and is OTA-ready at the partition level; automated signed rollout is a
planned follow-up. For this first product, update over USB with `idf.py flash`.
