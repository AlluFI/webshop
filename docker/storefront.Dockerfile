FROM node:20-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/storefront/package.json apps/storefront/
COPY apps/worker/package.json apps/worker/
COPY packages/shared packages/shared
COPY apps/storefront apps/storefront

ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_BASE=/api/v1
ENV NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ENV DOCKER_STOREFRONT=1
ENV API_PROXY_TARGET=http://api:3000
ENV API_INTERNAL_URL=http://api:3000/api/v1

RUN pnpm install --frozen-lockfile --filter storefront...
RUN pnpm --filter @volt/shared build
RUN pnpm --filter storefront build

FROM node:20-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

WORKDIR /repo
COPY --from=build /repo /repo

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV API_PROXY_TARGET=http://api:3000
ENV API_INTERNAL_URL=http://api:3000/api/v1
ENV NEXT_PUBLIC_API_BASE=/api/v1

EXPOSE 3000
WORKDIR /repo/apps/storefront
CMD ["pnpm", "start"]
