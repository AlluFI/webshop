# Volt & Co — I Love Shopping (Part 2)

B2C electronics shop: accounts, a PostgreSQL catalog, faceted search, and a React storefront. This is **Project 2 (Commerce)** of three. Cart, checkout, Stripe sandbox payments, RabbitMQ order worker, and encrypted addresses live here. Admin stays in Part 3.

## Stack

- **API:** Express + TypeScript
- **Web:** React 19 + Vite
- **Data:** PostgreSQL (Prisma, ACID transactions) + Redis (refresh sessions)
- **Mail:** Nodemailer → Mailpit (Docker)
- **Payments:** Stripe test mode + Payment Element (card data never hits our API)
- **Queue:** RabbitMQ + `apps/worker` (payment status → email + inventory)
- **Monorepo:** pnpm workspaces (`apps/api`, `apps/web`, `apps/worker`, `packages/shared`)

## Entity relationship diagram

See [docs/erd.md](docs/erd.md) for the implemented Part 1 catalog/auth schema and the Part 2 commerce schema (cart, addresses, orders, payments). Review tables remain planned for Part 3.

Refresh tokens are **not** stored in Postgres. Each login creates a Redis family (`rf:{familyId}` → current `jti`). Every refresh writes a new `jti` (single use). Replaying an old refresh token revokes the whole family. Access tokens are JWTs held **only in React memory**; logout puts the access `jti` on a Redis denylist until expiry.

Guest carts use an httpOnly `cart_token` cookie. The raw token never goes in the database — only its SHA-256. Signing in merges that cart into the user cart and clamps quantities to stock. Shipping addresses are encrypted at rest with AES-256-GCM (`DATA_ENCRYPTION_KEY`).

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
| API docs (Swagger) | http://localhost:3000/api/v1/docs |
| OpenAPI spec | http://localhost:3000/api/v1/openapi.json |
| Mailpit | http://localhost:8025 |
| RabbitMQ management | http://localhost:15672 (`guest` / `guest`) |
| Postgres (host) | `localhost:15432` |
| Redis (host) | `localhost:6379` |

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

### Stripe (sandbox)

Add **test** keys from the Stripe Dashboard to `.env`, then recreate the API container:

```bash
# .env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from Stripe CLI, optional if you use /checkout/orders/:id/sync
```

Host extra (optional, for live webhooks): [Stripe CLI](https://stripe.com/docs/stripe-cli)

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

Without the CLI, the storefront still confirms payment by retrieving the PaymentIntent from Stripe (`POST /checkout/orders/:id/sync`). The webhook publishes that status to RabbitMQ; the worker marks the order paid or failed, sends Mailpit mail, and restores stock on failure. The same handler runs in-process during automated tests (`QUEUE_INLINE`).

**Test cards** (any future expiry, any CVC):

| Result | Number |
| --- | --- |
| Success | `4242 4242 4242 4242` |
| Insufficient funds | `4000 0000 0000 9995` |
| Expired card | `4000 0000 0000 0069` |
| Generic decline | `4000 0000 0000 0002` |

Simulate a gateway timeout in non-production with header `X-Volt-Simulate: stripe-timeout` on `POST /checkout/place`.

**PCI DSS talking point:** we are aiming at **SAQ A**. Checkout uses Stripe.js / Payment Element. PAN, expiry, and CVC never POST to Express, never land in logs, and never sit in Postgres. We store Stripe PaymentIntent ids and encrypted order snapshots only. TLS for the public site is Part 3.

## Local development (optional)

Needs Docker only for Postgres, Redis, Mailpit, and RabbitMQ:

```bash
docker compose up -d postgres redis mailpit rabbitmq
cp .env.example apps/api/.env
# In apps/api/.env set MAIL_PORT=10250 and DATABASE_URL to port 15432
# Leave RABBITMQ_URL empty (or QUEUE_INLINE=true) if you are not running the worker
pnpm install
pnpm --filter @volt/shared build
pnpm --filter api exec prisma migrate deploy
pnpm --filter api seed
pnpm dev:api   # http://localhost:3000
pnpm --filter worker dev
pnpm dev:web   # http://localhost:5173
```

## Usage

1. Open the storefront and browse **Catalog**. Filter by category, brand, price, and rating; sort by relevance, price, or rating. Type in the header search for live suggestions.
2. Open a product: photos, metric **and** imperial weight/dimensions, stock, attributes. Add to cart from the catalog or the product page. Catalog images are Unsplash/Pexels lifestyle shots (not official pack shots), committed under `apps/api/prisma/seed-images/` so Docker seed works offline. Credits: [CREDITS.md](apps/api/prisma/seed-images/CREDITS.md). Thumbnail/full sizes come in Part 3.
3. Open **Cart**. Change quantities (live totals), hit a stock limit, refresh as a guest — the bag stays. Sign in: the guest bag merges into your account cart.
4. **Checkout** is one page: contact, address (Finnish postcodes, US ZIP, and other offline checks), shipping, live summary, then Stripe Payment Element. Logged-in users are prefilled. Pay with `4242…4242` for success; Mailpit gets the confirmation. Declined test cards restore stock and put items back in the cart. The cart page also shows related products from the same category or brand.
5. **Orders** (signed-in): filter by status and date, open the timeline, cancel an unpaid order, or refund a paid sandbox charge. Both paths restore stock.
6. Create an account (CAPTCHA required), confirm via Mailpit, sign in. Access tokens never go to `localStorage`.
7. Enable 2FA on **Account** with an authenticator app. Save extra shipping addresses there.
8. Forgot password sends a Mailpit link.
9. Explore or try endpoints at **http://localhost:3000/api/v1/docs**. After login, use **Authorize** with the `accessToken`. Guest cart calls also send the `cart_token` cookie. RabbitMQ management at http://localhost:15672 shows `payment.status` and the `payment.status.dlq` dead-letter queue. Worker logs print each consumed outcome.

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

- **Unit:** JWT generate/validate/expire, refresh rotation + reuse, input validation, product model, cart totals, address encryption
- **API:** register/login/refresh/revoke, catalog fields, facets, sort, suggestions, images, OpenAPI document, guest cart, merge on login, checkout validation, Stripe place + webhook (inline queue), concurrent last-unit checkout, order list/cancel/refund
- **Security:** parameterized search (injection payload), malformed JSON, unauthenticated `/me`, encrypted address columns

## Review talking points

Written explanations for the oral review items (JWT, ACID, Postgres growth, search, cart/checkout/payment tests, architecture, PCI) are in [docs/REVIEW_EXPLANATIONS.md](docs/REVIEW_EXPLANATIONS.md).

## Architecture notes

Modular monolith: Express API plus a RabbitMQ worker process from the same image (`node dist/worker.js`). PostgreSQL is the system of record (transactions, `SELECT FOR UPDATE` on checkout). Redis holds hot session state. Stripe webhooks publish `payment.status`; the worker emails and adjusts inventory. Failed handler messages go to `payment.status.dlq`.
