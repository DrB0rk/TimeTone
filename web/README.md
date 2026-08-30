# TimeTone dashboard

The TimeTone dashboard is a Next.js 16 application providing the admin UI,
live terminal API and SQLite persistence.

For a production-friendly Docker install, run [`../install.sh`](../install.sh)
from the repository root. It creates the required private environment file and
starts the service. For development:

```bash
cp .env.example .env
deno install --allow-scripts=npm:better-sqlite3
npm run dev
```

Production self-hosting is also supported with `docker compose up -d --build`.
See [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for credentials, HTTPS,
backups, browser USB updates and operating guidance.
