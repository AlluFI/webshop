FROM node:20-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm install --frozen-lockfile --filter api...

RUN pnpm --filter @volt/shared build

WORKDIR /repo/apps/api
RUN pnpm exec prisma generate
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 3000

# Seed no-ops once products exist, so a restart does not reset demo addresses or 2FA.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec prisma db seed && node dist/index.js"]
