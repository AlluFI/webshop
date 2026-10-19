# Part 1–3 review explanations

Written answers for the “student can explain / demonstrate” items are collected here. The live demo is still required; this document is the same story in writing so it can be read before or after the call.

Related files: [ERD](erd.md), [README](../README.md), [master plan](../PROJECT_MASTER_PLAN.md).

---

## 1. JWT: header, payload, and signature

A JSON Web Token is three Base64url pieces joined by dots: `header.payload.signature`.

| Part | What it is | What is put in it |
| --- | --- | --- |
| **Header** | Metadata for how the token is verified | `{ "alg": "HS256", "typ": "JWT" }` — HMAC with a shared secret, not an asymmetric key |
| **Payload** | Claims trusted by the API after verification | Access: `sub` (user id), `email`, `role`, `jti` (unique token id), `typ: "access"`, plus `iat` / `exp`. Refresh: `sub`, `fam` (session family), `jti`, `typ: "refresh"` |
| **Signature** | Proof that the header and payload were not changed | HMAC-SHA256 over `header.payload` using `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` |

The payload can be *decoded* by anyone (it is not encryption). A valid signature can be *forged* only by someone with the secret. Card data and passwords are therefore never placed in a JWT, and different secrets are used for access and refresh.

**How the two tokens are used**

- **Access token** (15 minutes): sent as `Authorization: Bearer …` on API calls. It is kept in React `useState` only — never in `localStorage` or `sessionStorage` (`apps/storefront/components/auth.tsx`). Memory can still be read by a stolen XSS payload while the tab is open, but a stolen disk cache or “check Application → Storage” demo does not show an access JWT.
- **Refresh token** (7 days): used only to mint a new access token. It is stored hashed-by-reference in Redis (`rf:{familyId}` → current `jti`) and is also set as an httpOnly cookie on `/api/v1/auth`.

Code: `apps/api/src/lib/jwt.ts`, `apps/storefront/components/auth.tsx`.

**Demo:** DevTools → Application → Local Storage / Session Storage is empty of tokens after login. The Network tab shows `Authorization` on `/auth/me`. A copied access token can be decoded on jwt.io (header + payload visible; the signature is verified only with the Docker secret).

---

## 2. Refresh rotation, single-use, and revocation

On login a **family** id and a refresh `jti` are created, and `rf:{fam} = jti` is stored in Redis.

On `/auth/refresh`:

1. The JWT signature is verified and `typ === "refresh"` is required.
2. Redis is read. If the key is gone, the session has been revoked or expired.
3. If Redis `jti` ≠ token `jti`, **reuse** is detected. An already-rotated token was replayed. The whole family is deleted and the request is rejected.
4. Otherwise a **new** `jti` is written and a new refresh JWT + new access JWT are returned. The old refresh JWT still verifies as a JWT, but Redis no longer matches, so it is rejected.

**Revocation of both token types**

| Token | Mechanism |
| --- | --- |
| Refresh | `rf:{fam}` is deleted (one session), or every family in `uf:{userId}` is deleted (logout-all / password reset) |
| Access | On logout, `deny:{jti}` is put in Redis until the access token would have expired. Logout-all also sets `user:{id}:valid_after` so any access token with an older `iat` is rejected even if that `jti` was never seen |

A JWT cannot be edited after issue, so revocation is an extra server-side check, not a change to the token itself.

Code: `apps/api/src/lib/tokens.ts`. Automated proof: `apps/api/src/lib/tokens.test.ts` and `apps/api/test/auth.api.test.ts`.

---

## 3. Why PostgreSQL, and how it can grow

E-commerce data is relational: users, roles, categories, brands, products, images, carts, and orders. Foreign keys, transactions, and indexes are provided by PostgreSQL on one engine that already follows ACID.

**What is used today**

- B-tree indexes on `products.categoryId`, `brandId`, `price`, `averageRating`, unique slugs and emails.
- A **GIN** index on `products.search_vector` for full-text search.
- Prisma migrations so schema changes are versioned and replayable.
- Redis next to Postgres for **hot, short-lived** data (sessions, TOTP setup, OAuth state). Write-heavy session rotation is kept off the primary tables.

**How this supports growth (talking points)**

| Pressure | What can be added without rewriting the shop |
| --- | --- |
| Catalog reads during a sale | More indexes / `EXPLAIN ANALYZE`, then Redis or CDN cache for popular product JSON |
| More writes (orders) | Checkout is kept in a single Postgres transaction; read replicas can later be added for listing/search |
| Huge order history | `orders` can be partitioned by created month |
| Need to scale the HTTP layer | More API containers can be run in front of the same database (stateless API; sessions are already in Redis) |
| Need to split payments later | The modular monolith already isolates catalog/auth; `apps/worker` already consumes RabbitMQ and can be scaled as its own process |

Vertical scaling is applied first (indexes, caching, connection pooling), then replicas and extra API replicas. Microservices were **not** started because one catalog and one user table do not justify network hops yet.

---

## 4. ACID and why a shop needs it

| Letter | Meaning | Why it matters here |
| --- | --- | --- |
| **Atomicity** | All steps in a transaction commit, or none do | Password reset updates the hash **and** marks the token used together. Checkout creates the order, writes encrypted address snapshots, and decrements stock in one `prisma.$transaction` — or none of that happens. |
| **Consistency** | Constraints stay true after every commit | Unique email, FKs, and stock that cannot go negative. Invalid states cannot be saved. |
| **Isolation** | Concurrent transactions behave as if they ran one after another | Two customers buying the last unit must not both succeed. Place-order locks the product row (`SELECT FOR UPDATE`) so only one checkout gets quantity 1. |
| **Durability** | A committed write survives a crash | Postgres WAL + a Docker volume. After `migrate`/`seed`, a restart still has the catalog and unpaid orders. |

Transactions are already used for email verify, password reset, and 2FA. ACID matters for money at checkout: the concurrent last-unit test in `apps/api/test/payment.api.test.ts` is the proof.

---

## 5. Search: database design and how a query runs

**Browse / facets (structured filters)**  
`GET /api/v1/products?category=&brand=&minPrice=&maxPrice=&minRating=&sort=`  
Prisma `where` clauses on indexed columns are used, plus `groupBy` for facet counts (how many products remain per brand/category). This is faceted search: filters are stacked by the shopper instead of one keyword only.

**Typeahead**  
`GET /api/v1/search/suggest?q=`  
Prefix/contains match on product name and brand (and category names). Debounce is applied in the header. Results are links to a PDP or a filtered catalog.

**Relevance text search**  
A generated column is maintained by Postgres:

```sql
search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector('english', name || ' ' || description)
) STORED
```

plus `CREATE INDEX … USING GIN (search_vector)`.

When `sort=relevance` and `q` is set, ranking is done with `ts_rank` / `plainto_tsquery`. The query is parameterized (`$queryRaw` with a bound `q`), so a payload like `'; DROP TABLE products; --` is data, not SQL. If the tsvector path fails, `ILIKE` contains is used as a fallback.

Code: `apps/api/src/services/catalog.service.ts`, migration in `apps/api/prisma/migrations/20260820120000_init/migration.sql`.  
Demo: “sony” is typed in the header; Catalog is filtered to Audio + min rating 4; sort by price is used.

---

## 6. Testing approach

**Automated** tests are mixed with **manual** tests for things that need a browser or a third party (CAPTCHA widget, Google account picker, authenticator app).

### Automated (Vitest + Supertest)

| Kind | File | What is proved |
| --- | --- | --- |
| Unit — JWT | `apps/api/src/lib/jwt.test.ts` | Three-part token, payload claims, wrong secret, expired token, refresh cannot be used as access |
| Unit — rotation | `apps/api/src/lib/tokens.test.ts` | New refresh issued, old refresh rejected, access denylist |
| Unit — validation | `apps/api/src/lib/validation.test.ts` | Email/password/CAPTCHA field errors |
| Unit — product model | `apps/api/src/lib/product-model.test.ts` | Required fields, dual-unit dimensions, rejects bad price/images, promotion needs a date frame below retail |
| Unit — pricing | `apps/api/src/lib/pricing.test.ts` | Finnish VAT split and promotion price only inside the date frame |
| Unit — cart math | `apps/api/src/lib/cart-math.test.ts` | Line totals, free-shipping threshold, clamp to stock, euros → integer cents for Stripe |
| Unit — encryption | `apps/api/src/lib/crypto.test.ts` | AES-256-GCM round-trip, unique ciphertext, reject tampered bytes |
| Unit — order email | `apps/api/src/lib/order-email.test.ts` | Confirmation HTML/text includes items, totals, shipping, status |
| Unit — carriers | `apps/api/src/lib/carriers/*-mock.test.ts` | Posti / PostNord / Budbee request mapping plus mock labels and tracking |
| API + DB | `apps/api/test/auth.api.test.ts` | Register, verify, login, persist user, refresh reuse, logout revoke |
| API + DB | `apps/api/test/catalog.api.test.ts` | Required product shape, facets, sort, suggestions, image bytes, live Sony promotion and 30-day lowest price (no public promotion history) |
| API + DB | `apps/api/test/cart.api.test.ts` | Guest add/persist/update, stock 409, merge on login, logged-in cart across sessions |
| API + DB | `apps/api/test/checkout.api.test.ts` | Empty-cart quote, field errors, Finnish postcode, prefill, encrypted address column |
| API + DB | `apps/api/test/payment.api.test.ts` | Stripe place + webhook, decline restores stock, timeout holds nothing, last-unit race |
| API + DB | `apps/api/test/orders.api.test.ts` | Filter, cancel unpaid, refund paid with a reason, hide retry after a later paid order |
| API + DB | `apps/api/test/admin.api.test.ts` | MFA, CRUD, order handling → shipment labels for Posti / PostNord / Budbee |
| API | `apps/api/test/openapi.test.ts` | OpenAPI 3 spec is served; Swagger UI HTML is available |
| Security | `apps/api/test/security.test.ts` | Injection string in `q` does not drop tables; malformed JSON; `/me` without token |

How tests are run (Docker stack up):

```bash
docker compose exec api pnpm test
# or from the repo, with Postgres + Redis reachable:
pnpm test
```

Unit tests are always run. API/security tests are skipped if the database is down, so JWT/validation coverage is still obtained on a laptop without Compose.

### Manual (security-critical UX)

| Test | What is done |
| --- | --- |
| CAPTCHA | Register is opened; submit without the widget → client error; the test-key widget is completed → account created; the verify link is shown in Mailpit |
| OAuth | `GOOGLE_*` is set in `.env`, the API is restarted, Continue with Google is used; cancel on Google’s screen must not create a broken session |
| 2FA | Account → enable, QR is scanned, confirm; sign out; login asks for a 6-digit code on a **new** form (email/password are not left in the fields); disable with a current code |
| Stripe | Pay with `4242…4242`; decline `4000…9995`; no PAN on the shop Network tab; Mailpit HTML confirmation |
| Queue | RabbitMQ `payment.status` after Pay; worker log line; failed messages land on `payment.status.dlq` if the handler throws |
| Parcel label | Order handling → Print label for Posti, PostNord, or Budbee; a Volt HTML label and demo tracking are returned in mock mode |

CAPTCHA and Google’s redirect are not treated as fully trusted from unit tests alone (test keys / bypass tokens exist only for `NODE_ENV=test`).

### Testing of cart, checkout, and payments

**Pure money math** is split from **HTTP + database**.

**Cart**

- Unit: `cart-math.test.ts` — line totals use rounded cents so `19.99 × 3` is `59.97`, not a float surprise. Quantity is clamped to stock. Stripe amounts are integer cents.
- API: `cart.api.test.ts` — a guest cookie cart can add, persist across `GET /cart`, update quantity, and get **409** when the add would oversell or stock is 0. After register/login, guest lines are merged onto the user cart. A second client with the access token still sees those lines (persistent logged-in cart).

**Checkout**

- Validation lives in Zod (`validation.test.ts` plus `checkout.api.test.ts`): an empty cart cannot be quoted; bad email/phone/postcode return **field** errors, not a generic 500; a signed-in user with a saved address is given prefill. The address row in Postgres is ciphertext (`cityEnc` does not contain `"Helsinki"`; `decrypt` does).

**Payments**

- Stripe is mocked at the SDK in `payment.api.test.ts`. Routes and Postgres are real.
- Place order → stock is decremented immediately, status `PENDING_PAYMENT`, client secret is returned. The cart stays filled so the browser back button still shows the bag. A **signed** `payment_intent.succeeded` webhook (or the inline queue in tests) marks the order `PAID` and then clears the cart. Opening **Cart** while payment is still pending cancels that unpaid checkout and puts stock back. Shipping ciphertext still has no plaintext city.
- `payment_intent.payment_failed` **or** `POST /checkout/orders/:id/sync` on a declined PaymentIntent restores stock **and** puts the lines back in the cart. `/sync` is called on a card decline so Stripe CLI is not required for the Mailpit failure email.
- `X-Volt-Simulate: stripe-timeout` on place returns **504** and does **not** decrement stock (gateway never created an intent).
- Two agents checkout the last unit in `Promise.all`: statuses are `[201, 409]`, remaining stock is 0.
- Tests set `QUEUE_INLINE=true` so the worker handler is run in-process. In Docker, the same handler is `apps/worker` consuming RabbitMQ.

**Still demoed by hand:** Stripe.js Payment Element (no PAN on the shop Network tab), Mailpit HTML confirmation, RabbitMQ `payment.status`, decline cards `4000…9995` / `4000…0069`. After a decline the order page is opened and the failure mail is received in Mailpit without Stripe CLI.

---

## 7. Architecture: modular monolith

A **modular monolith** is used, not a distributed set of microservices.

- **One deployable API** (Express) with folders for auth, catalog, mail, tokens, and carriers — modules, not separate repos.
- **One Docker storefront** (Next.js 15 App Router in `apps/storefront`) talking only to versioned HTTP: `/api/v1/...`. Interactive docs live at `/api/v1/docs` (OpenAPI 3 + Swagger UI). A leftover Vite SPA in `apps/web` is kept for local `pnpm dev:web` and is not served by Docker.
- **One Postgres** as the system of record; **Redis** for session state.
- **Docker Compose** runs API, Next storefront, worker, Postgres, Redis, Mailpit, RabbitMQ, and nginx TLS. Docker plus optional Stripe CLI is required for reviewers.

**Why this fits Part 3 and still scales**

- A three-part shop does not yet have independent teams or independent data ownership. Extra failure modes and harder reviews would be added by microservices without buying real scale.
- The API is stateless aside from Redis, so more API containers can be run when traffic grows.
- `apps/worker` consumes RabbitMQ **without** splitting the catalog database. Payment webhooks publish `payment.status`; the order is updated, email is sent, and inventory is restored by the worker. If payment volume later needs its own process, that module is already a boundary.
- Carrier integrations are isolated under `apps/api/src/lib/carriers/`. Mock adapters return Volt labels; live adapters (Posti OAuth, PostNord OAuth, Budbee Basic auth) are selected with `*_MODE=live`.
- BI and SaaS integrations are already in the codebase: `analytics_*` SQL views for a replica warehouse, hashed `volt_test_` / `volt_live_` API keys on `/api/v1/integrations/v1/*`, and HMAC-signed webhooks. Production cutover is replica access plus Admin → Integrations keys — see [INTEGRATIONS.md](INTEGRATIONS.md).
- **Voltie** is the customer shop assistant. Guests get catalog/FAQ only; signed-in customers can see their own orders and confirm a claim. Tickets use a Jira-shaped payload stored locally and emailed to Mailpit (`TICKET_MODE=mock`) so the demo does not need Jira — see [VOLTIE.md](VOLTIE.md).

**What is not done yet:** a separate “User Service” and “Product Service” with two databases. Joining products to brands/categories and to order lines is exactly what one relational database is for.

---

## 8. PCI DSS and why cardholder data is not stored on the servers

PCI DSS is the card-brand security standard. How much of it must be operated by the merchant depends on whether **cardholder data (CHD)** — PAN, expiry, CVC — ever touches the merchant systems.

| If PAN / CVC is… | Then the shop… |
| --- | --- |
| Collected in shop HTML and posted to Express | Becomes a CHD environment (SAQ D-level): encryption of PAN, logging bans, quarterly scans |
| Collected by **Stripe.js / Payment Element** so the iframe talks only to Stripe | Qualifies for **SAQ A**: the form is hosted by a PCI DSS Level 1 provider |

The second option is used.

1. `POST /checkout/place` creates a Stripe PaymentIntent and a **client secret** is returned. Stock is reserved in the same request. No card fields are accepted on that body.
2. The card is confirmed **with Stripe**. Number format, expiry, and CVC are checked by Stripe.js before submit.
3. The shop webhook is called by Stripe (or `/checkout/orders/:id/sync` is hit by the shopper). Only PaymentIntent **ids and statuses** are received.
4. That outcome is published to RabbitMQ. Stripe ids plus AES-256-GCM snapshots of address and contact are stored in Postgres — never PAN, expiry, or CVC. Public TLS is the `tls` nginx service. Email is sent and inventory is adjusted by the worker, not by the webhook request.

**Demo:** Network tab on Pay — no `card`, `cvc`, or `exp` on the shop API. Stripe test cards. Mailpit. RabbitMQ `payment.status`.

Code: `apps/storefront/components/checkout-page.tsx`, `apps/api/src/services/order.service.ts`, `apps/api/src/lib/queue.ts`, `apps/api/src/worker.ts`, `apps/api/src/routes/webhooks.ts`.

---

## 9. CIA (confidentiality, integrity, availability)

| Goal | How it is done |
| --- | --- |
| **Confidentiality** | TLS at nginx (`https://localhost:8443`); AES-256-GCM for addresses, order snapshots, payment metadata, audit `metaEnc`, and refresh JTIs in Redis; access JWT only in memory; staff 2FA; RBAC on `/admin`; two-factor fields remounted so login values are not left on the TOTP page |
| **Integrity** | Signed JWTs; Argon2 password hashes; checkout `SELECT FOR UPDATE`; purchased-only reviews; audit log of staff writes |
| **Availability** | Docker healthchecks; Redis token-bucket (429 before the process melts); worker can scale off HTTP; k6 report in `docs/PERFORMANCE.md` |

---

## 10. Semantic HTML and accessibility

Native landmarks (`header`, `nav`, `main`, `footer`, `aside`, `article`) are used, one `h1` per page, `h2` for sections, real `button`s (not clickable `div`s), `label` + `for` on filters, a skip link, and `:focus-visible` outlines. An `aria-label` is exposed on star ratings. Contrast for body text is forest-on-paper; star glyphs use a darker gold (`#7a5a12`) so they stay readable. Font sizes are `rem`, so 200% zoom still reflows (header stacks under 600px).

---

## 11. Part 3 tests (reviews, admin, rate limit, carriers)

- Unit: `apps/api/src/lib/review.test.ts` (average + Zod), `apps/api/src/lib/rate-limit.test.ts` (Redis token bucket), `apps/api/src/lib/carriers/*-mock.test.ts` (Posti / PostNord / Budbee).
- API: `apps/api/test/reviews.api.test.ts` (403 without purchase, 201 after a paid order, sort + vote).
- Admin: `apps/api/test/admin.api.test.ts` (MFA required, CRUD, bulk JSON, refuse staff role without 2FA, order handling shipment labels).
- Security: unauthenticated `/admin/users` is 401.

Demo: `docker compose exec api pnpm test`. Storefront smokes: `pnpm test:e2e` (Playwright, stack on :8088). For load: `docker compose --profile load run --rm k6` and `docs/PERFORMANCE.md` is opened. A 200 VU browse ramp is `K6_PROFILE=stress`.

---

## Quick demo script (same as README, with “explain” beats)

1. `./scripts/start.sh` → https://localhost:8443 (the cert is accepted) or http://localhost:8088, Mailpit http://localhost:8025.
2. Login `customer@volt.test` / `Shopping123`. Empty Local Storage is shown. jwt.io is opened on an access token from the Network tab (header / payload / signature).
3. Refresh is called twice with the **first** refresh token (or the automated test is used) — second call 401 “reuse”.
4. Catalog facets + sort + typeahead + grid/list; a PDP is opened (thumbs + full, metric/imperial, reviews).
5. A review is left/voted on the seeded Sony purchase; the average is updated.
6. Guest: add to cart, refresh, still there; header quick cart. Sign in: the cart is merged.
7. Checkout: prefill, bad postcode field error, Pay with `4242…4242`; confirmation shows `VC-` reference + estimated delivery; Mailpit HTML. Then `4000…9995`: the order page is opened, items are returned to the cart, the failure mail is received in Mailpit (no Stripe CLI).
8. Admin `admin@volt.test` + TOTP `DEMOADMIN2FASECRETKEYAA`: the two-factor fields are empty (email/password are not reused). CRUD, bulk CSV, hide a review, **order handling** Print label (Posti / PostNord / Budbee mock), hand to courier, refuse a role until 2FA.
9. Contact form → Mailpit; unknown URL → 404; burst `/auth/login` → 429.
10. `docker compose exec api pnpm test` then k6 + `docs/PERFORMANCE.md`. ACID, PCI, CIA, and semantic HTML are walked through.
