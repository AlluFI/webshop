# Volt & Co — I Love Shopping (Part 1)

B2C electronics shop: accounts, a PostgreSQL catalog, faceted search, and a React storefront. This is **Project 1 (Foundation)** of three. Cart, checkout, and admin land in later repos.

## Stack

- **API:** Express + TypeScript
- **Web:** React 19 + Vite
- **Data:** PostgreSQL (Prisma, ACID transactions) + Redis (refresh sessions)
- **Mail:** Nodemailer → Mailpit (Docker)
- **Monorepo:** pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`)

## Entity relationship diagram

See [docs/erd.md](docs/erd.md) for the implemented Part 1 schema and the planned Part 2/3 entities (cart, orders, reviews).

Refresh tokens are **not** stored in Postgres. Each login creates a Redis family (`rf:{familyId}` → current `jti`). Every refresh writes a new `jti` (single use). Replaying an old refresh token revokes the whole family. Access tokens are JWTs held **only in React memory**; logout puts the access `jti` on a Redis denylist until expiry.

## Setup (Docker is the only host prerequisite)

```bash
./scripts/start.sh
```

or:

```bash
cp .env.example .env
docker compose up --build
```

| Service | URL |
| --- | --- |
| Storefront | http://localhost:8088 |
| API health | http://localhost:3000/api/v1/health |
| Mailpit | http://localhost:8025 |
| Postgres (host) | `localhost:15432` |
| Redis (host) | `localhost:6379` |

The storefront uses port **8088** so it does not collide with other local apps on 8080.

Google reCAPTCHA **test keys** are in `.env.example` so registration works on localhost without a Google Cloud project.

### Demo account

| Email | Password |
| --- | --- |
| `customer@volt.test` | `Shopping123` |

The account is pre-verified. Registering a new user sends a link to Mailpit.

### Google OAuth (optional)

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Authorized redirect URI:

`http://localhost:3000/api/v1/auth/google/callback`

If those variables are empty, email-password still works and the Google button is hidden.

## Local development (optional)

Needs Docker only for Postgres, Redis, and Mailpit:

```bash
docker compose up -d postgres redis mailpit
cp .env.example apps/api/.env
# In apps/api/.env set MAIL_PORT=10250 and DATABASE_URL to port 15432
pnpm install
pnpm --filter @volt/shared build
pnpm --filter api exec prisma migrate deploy
pnpm --filter api seed
pnpm dev:api   # http://localhost:3000
pnpm dev:web   # http://localhost:5173
```

## Usage

1. Open the storefront and browse **Catalog**. Filter by category, brand, price, and rating; sort by relevance, price, or rating. Type in the header search for live suggestions.
2. Open a product: images, metric **and** imperial weight/dimensions, stock, attributes.
3. Create an account (CAPTCHA required), confirm via Mailpit, sign in. Access tokens never go to `localStorage`.
4. Enable 2FA on **Account** with an authenticator app.
5. Forgot password sends a Mailpit link.

## Tests

From the repo root (API image includes Vitest). Unit tests always run. API/security tests run when Postgres + Redis are reachable:

```bash
docker compose exec api pnpm test
```

or locally after dependencies are up:

```bash
pnpm test
```

Coverage:

- **Unit:** JWT generate/validate/expire, refresh rotation + reuse, input validation, product model
- **API:** register/login/refresh/revoke, catalog fields, facets, sort, suggestions, images
- **Security:** parameterized search (injection payload), malformed JSON, unauthenticated `/me`

## Architecture notes

Modular monolith: one Express process, versioned `/api/v1` routes. PostgreSQL is the system of record (transactions, indexes, later replicas). Redis holds hot session state. Part 2 adds a RabbitMQ worker without rewriting the catalog.
