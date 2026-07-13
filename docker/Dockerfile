# Multi-stage build for the TimeForge API + worker (NestJS monorepo).
# Node 22 (not 20): @supabase/realtime-js — pulled in by NotificationsRealtimeService's
# createClient() — requires a native `WebSocket` global, which only exists from Node 22.
# On Node 20 the API crashes at boot ("Node.js 20 detected without native WebSocket
# support") as soon as SUPABASE_* env vars are present and the realtime client initializes.
FROM node:22-bookworm-slim AS base
WORKDIR /app
# npm's update-notifier makes a background network call on every invocation;
# in restricted container networking that call can hang, which blocks npx/npm
# from exiting — silently stalling any `&&`-chained start command (see the
# Railway healthcheck-hang debugged in PR #9/#10).
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
# Prisma's CLI independently makes its own background "checkpoint" telemetry
# call (to checkpoint.prisma.io) on every invocation, which can hang the same
# way even with npx removed from the equation — this is the second, separate
# cause of the same silent-hang symptom.
ENV CHECKPOINT_DISABLE=1
# openssl is required by Prisma; build tools for native deps (argon2).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# ── deps ──
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate

# ── build ──
FROM deps AS build
COPY . .
RUN npm run build

# ── runtime ──
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig*.json ./
EXPOSE 3000
CMD ["node", "dist/apps/api/src/main.js"]
