# Legacy Vite static build. Compose `web` now uses docker/storefront.Dockerfile.
FROM node:20-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared packages/shared
COPY apps/web apps/web

ARG VITE_API_BASE=/api/v1
ARG VITE_RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI

RUN pnpm install --frozen-lockfile --filter web...
RUN pnpm --filter @volt/shared build

WORKDIR /repo/apps/web
RUN printf 'VITE_API_BASE=%s\nVITE_RECAPTCHA_SITE_KEY=%s\n' "$VITE_API_BASE" "$VITE_RECAPTCHA_SITE_KEY" > .env.production
RUN pnpm run build

FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80
