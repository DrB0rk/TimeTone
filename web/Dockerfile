FROM denoland/deno:alpine-2.8.3 AS deps
WORKDIR /app
COPY package.json deno.lock ./
RUN deno install --allow-scripts=npm:better-sqlite3

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next collects server routes in parallel; keep build-time SQLite isolated from
# runtime data and avoid concurrent initialization of the persistent volume.
ENV DATABASE_PATH=/tmp/timetone-build.db
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tzdata sqlite
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN mkdir -p /data
ENV DATABASE_PATH=/data/timekeep.db
ENV TZ=Europe/Amsterdam
EXPOSE 3000
CMD ["node", "server.js"]
