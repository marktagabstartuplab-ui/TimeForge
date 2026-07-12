# Multi-stage build for the TimeForge API + worker (NestJS monorepo).
FROM node:20-bookworm-slim AS base
WORKDIR /app
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
