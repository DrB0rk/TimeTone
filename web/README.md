# ESP Timekeep web application

Next.js 16 application providing the admin dashboard and ESP device API.

```bash
cp .env.example .env
deno install --allow-scripts=npm:better-sqlite3
npm run dev
```

Production self-hosting is supported with `docker compose up -d --build`. See
[`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for credentials, TLS, backups,
and operating guidance.
