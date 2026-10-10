# Part 1–3 review explanations

Written answers for the “student can explain / demonstrate” items. The live demo still matters; this document is the same story in writing so reviewers can read it before or after the call.

Related files: [ERD](erd.md), [README](../README.md), [master plan](../PROJECT_MASTER_PLAN.md).

---

## 1. JWT: header, payload, and signature

A JSON Web Token is three Base64url pieces joined by dots: `header.payload.signature`.

| Part | What it is | What we put in it |
| --- | --- | --- |
| **Header** | Metadata for how to verify the token | `{ "alg": "HS256", "typ": "JWT" }` — HMAC with a shared secret, not an asymmetric key |
| **Payload** | Claims the API trusts after verification | Access: `sub` (user id), `email`, `role`, `jti` (unique token id), `typ: "access"`, plus `iat` / `exp`. Refresh: `sub`, `fam` (session family), `jti`, `typ: "refresh"` |
| **Signature** | Proof the header and payload were not changed | HMAC-SHA256 over `header.payload` using `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` |

Anyone can *decode* the payload (it is not encryption). Only someone with the secret can *forge* a valid signature. That is why we never put card data or passwords in a JWT, and why access and refresh use **different** secrets.

**How this shop uses the two tokens**

- **Access token** (15 minutes): sent as `Authorization: Bearer …` on API calls. The React app keeps it in `useState` only — never `localStorage` or `sessionStorage`. A stolen XSS payload can still read memory while the tab is open, but a stolen disk cache or “check Application → Storage” demo will not show an access JWT.
- **Refresh token** (7 days): used only to mint a new access token. It is stored hashed-by-reference in Redis (`rf:{familyId}` → current `jti`) and also set as an httpOnly cookie on `/api/v1/auth`.

Code: `apps/api/src/lib/jwt.ts`, `apps/web/src/auth.tsx`.

**Demo:** DevTools → Application → Local Storage / Session Storage should be empty of tokens after login. Network tab shows `Authorization` on `/auth/me`. jwt.io can decode a copied access token (header + payload visible, signature verifies only with the Docker secret).

---

## 2. Refresh rotation, single-use, and revocation

On login we create a **family** id and a refresh `jti`, and store `rf:{fam} = jti` in Redis.

On `/auth/refresh`:

1. Verify the JWT signature and `typ === "refresh"`.
2. Read Redis. If the key is gone → session revoked or expired.
3. If Redis `jti` ≠ token `jti` → **reuse**. Someone replayed an already-rotated token. We delete the whole family and reject.
4. Otherwise write a **new** `jti`, return a new refresh JWT + new access JWT. The old refresh JWT still verifies as a JWT, but Redis no longer matches, so it is rejected.

**Revocation of both token types**

| Token | Mechanism |
| --- | --- |
| Refresh | Delete `rf:{fam}` (one session) or every family in `uf:{userId}` (logout-all / password reset) |
| Access | On logout, put `deny:{jti}` in Redis until the access token would have expired. Logout-all also sets `user:{id}:valid_after` so any access token with an older `iat` is rejected even if we never saw that `jti` |

A JWT cannot be edited after issue, so revocation is an extra server-side check, not a change to the token itself.

Code: `apps/api/src/lib/tokens.ts`. Automated proof: `apps/api/src/lib/tokens.test.ts` and `apps/api/test/auth.api.test.ts`.

---

## 3. Why PostgreSQL, and how it can grow

E-commerce data is relational: users, roles, categories, brands, products, images, later carts and orders. PostgreSQL gives us foreign keys, transactions, and indexes on one engine that already follows ACID.

**What is used today**

- B-tree indexes on `products.categoryId`, `brandId`, `price`, `averageRating`, unique slugs and emails.
- A **GIN** index on `products.search_vector` for full-text search.
- Prisma migrations so schema changes are versioned and replayable.
- Redis next to Postgres for **hot, short-lived** data (sessions, TOTP setup, OAuth state). That keeps write-heavy session rotation off the primary tables.

**How this supports growth (talking points)**

| Pressure | What we would add without rewriting the shop |
| --- | --- |
| Catalog reads during a sale | More indexes / `EXPLAIN ANALYZE`, then Redis or CDN cache for popular product JSON |
| More writes (orders in Part 2) | Keep checkout in a single Postgres transaction; later read replicas for listing/search |
| Huge order history | Partition `orders` by created month |
| Need to scale the HTTP layer | Run more API containers in front of the same database (stateless API; sessions already in Redis) |
| Need to split payments later | The modular monolith already isolates catalog/auth; `apps/worker` already consumes RabbitMQ and can scale as its own process |

Vertical first (indexes, caching, connection pooling), then replicas and extra API replicas. We did **not** start with microservices because one catalog and one user table do not justify network hops yet.

---

## 4. ACID and why a shop needs it

| Letter | Meaning | Why it matters here |
| --- | --- | --- |
| **Atomicity** | All steps in a transaction commit, or none do | Password reset updates the hash **and** marks the token used together. Checkout creates the order, writes encrypted address snapshots, and decrements stock in one `prisma.$transaction` — or none of that happens. |
| **Consistency** | Constraints stay true after every commit | Unique email, FKs, and stock that cannot go negative. Invalid states cannot be saved. |
| **Isolation** | Concurrent transactions behave as if they ran one after another | Two customers buying the last unit must not both succeed. Place-order locks the product row (`SELECT FOR UPDATE`) so only one checkout gets quantity 1. |
| **Durability** | A committed write survives a crash | Postgres WAL + a Docker volume. After `migrate`/`seed`, a restart still has the catalog and unpaid orders. |

Part 1 already uses transactions for email verify, password reset, and 2FA. Part 2 is where ACID matters for money: the concurrent last-unit test in `apps/api/test/payment.api.test.ts` is the proof.

---

## 5. Search: database design and how a query runs

**Browse / facets (structured filters)**  
`GET /api/v1/products?category=&brand=&minPrice=&maxPrice=&minRating=&sort=`  
Prisma `where` clauses on indexed columns, plus `groupBy` for facet counts (how many products remain per brand/category). This is faceted search: the shopper stacks filters instead of one keyword only.

**Typeahead**  
`GET /api/v1/search/suggest?q=`  
Prefix/contains match on product name and brand (and category names). Debounced in the header. Results are links to a PDP or a filtered catalog.

**Relevance text search**  
A generated column is maintained by Postgres:

```sql
search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector('english', name || ' ' || description)
) STORED
```

plus `CREATE INDEX … USING GIN (search_vector)`.

When `sort=relevance` and `q` is set, we rank with `ts_rank` / `plainto_tsquery`. The query is parameterized (`$queryRaw` with a bound `q`), so a payload like `'; DROP TABLE products; --` is data, not SQL. If the tsvector path fails, we fall back to `ILIKE` contains.

Code: `apps/api/src/services/catalog.service.ts`, migration in `apps/api/prisma/migrations/20260820120000_init/migration.sql`.  
Demo: type “sony” in the header; filter Catalog → Audio + min rating 4; sort by price.

---

## 6. Testing approach

The current implementation mixes **automated** tests with **manual** tests for things that need a browser or a third party (CAPTCHA widget, Google account picker, authenticator app).

### Automated (Vitest + Supertest)

| Kind | File | What it proves |
| --- | --- | --- |
| Unit — JWT | `apps/api/src/lib/jwt.test.ts` | Three-part token, payload claims, wrong secret, expired token, refresh cannot be used as access |
| Unit — rotation | `apps/api/src/lib/tokens.test.ts` | New refresh issued, old refresh rejected, access denylist |
| Unit — validation | `apps/api/src/lib/validation.test.ts` | Email/password/CAPTCHA field errors |
| Unit — product model | `apps/api/src/lib/product-model.test.ts` | Required fields, dual-unit dimensions, rejects bad price/images |
| Unit — cart math | `apps/api/src/lib/cart-math.test.ts` | Line totals, free-shipping threshold, clamp to stock, euros → integer cents for Stripe |
| Unit — encryption | `apps/api/src/lib/crypto.test.ts` | AES-256-GCM round-trip, unique ciphertext, reject tampered bytes |
| Unit — order email | `apps/api/src/lib/order-email.test.ts` | Confirmation HTML/text includes items, totals, shipping, status |
| API + DB | `apps/api/test/auth.api.test.ts` | Register, verify, login, persist user, refresh reuse, logout revoke |
| API + DB | `apps/api/test/catalog.api.test.ts` | Required product shape, facets, sort, suggestions, image bytes |
| API + DB | `apps/api/test/cart.api.test.ts` | Guest add/persist/update, stock 409, merge on login, logged-in cart across sessions |
| API + DB | `apps/api/test/checkout.api.test.ts` | Empty-cart quote, field errors, Finnish postcode, prefill, encrypted address column |
| API + DB | `apps/api/test/payment.api.test.ts` | Stripe place + webhook, decline restores stock, timeout holds nothing, last-unit race |
| API + DB | `apps/api/test/orders.api.test.ts` | Filter, cancel unpaid, refund paid, hide retry after a later paid order |
| API | `apps/api/test/openapi.test.ts` | OpenAPI 3 spec is served; Swagger UI HTML is available |
| Security | `apps/api/test/security.test.ts` | Injection string in `q` does not drop tables; malformed JSON; `/me` without token |

How to run (Docker stack up):

```bash
docker compose exec api pnpm test
# or from the repo, with Postgres + Redis reachable:
pnpm test
```

Unit tests always run. API/security tests skip if the database is down, so a laptop without Compose still gets JWT/validation coverage.

### Manual (security-critical UX)

| Test | What to do |
| --- | --- |
| CAPTCHA | Open Register, submit without the widget → client error; complete the test-key widget → account created; Mailpit shows the verify link |
| OAuth | Set `GOOGLE_*` in `.env`, restart API, click Continue with Google; cancel on Google’s screen should not create a broken session |
| 2FA | Account → enable, scan QR, confirm; sign out; login asks for a 6-digit code; disable with a current code |
| Stripe | Pay with `4242…4242`; decline `4000…9995`; Network tab has no PAN on our API; Mailpit HTML confirmation |
| Queue | RabbitMQ `payment.status` after Pay; worker log line; failed messages land on `payment.status.dlq` if the handler throws |

We do not pretend CAPTCHA or Google’s redirect can be fully trusted from unit tests alone (test keys / bypass tokens exist only for `NODE_ENV=test`).

### Testing of cart, checkout, and payments

**Pure money math** is split from **HTTP + database**.

**Cart**

- Unit: `cart-math.test.ts` — line totals use rounded cents so `19.99 × 3` is `59.97`, not a float surprise. Quantity is clamped to stock. Stripe amounts are integer cents.
- API: `cart.api.test.ts` — a guest cookie cart can add, persist across `GET /cart`, update quantity, and get **409** when the add would oversell or stock is 0. After register/login, the same agent’s guest lines merge onto the user cart. A second client with the access token still sees those lines (persistent logged-in cart).

**Checkout**

- Validation lives in Zod (`validation.test.ts` plus `checkout.api.test.ts`): empty cart cannot quote; bad email/phone/postcode return **field** errors, not a generic 500; a signed-in user with a saved address gets prefill. The address row in Postgres is ciphertext (`cityEnc` does not contain `"Helsinki"`; `decrypt` does).

**Payments**

- Stripe is mocked at the SDK in `payment.api.test.ts`. Routes and Postgres are real.
- Place order → stock decrements immediately, cart empties, status `PENDING_PAYMENT`, client secret returned. A **signed** `payment_intent.succeeded` webhook (or the inline queue in tests) marks the order `PAID`. Shipping ciphertext still has no plaintext city.
- `payment_intent.payment_failed` restores stock **and** puts the lines back in the cart.
- `X-Volt-Simulate: stripe-timeout` on place returns **504** and does **not** decrement stock (gateway never created an intent).
- Two agents checkout the last unit in `Promise.all`: statuses are `[201, 409]`, remaining stock is 0.
- Tests set `QUEUE_INLINE=true` so the worker handler runs in-process. In Docker, the same handler is `apps/worker` consuming RabbitMQ.

**Still demoed by hand:** Stripe.js Payment Element (no PAN on the shop Network tab), Mailpit HTML confirmation, RabbitMQ `payment.status`, decline cards `4000…9995` / `4000…0069`.

---

## 7. Architecture: modular monolith

I chose a **modular monolith**, not a distributed set of microservices.

- **One deployable API** (Express) with folders for auth, catalog, mail, tokens — modules, not separate repos.
- **One React app** talking only to versioned HTTP: `/api/v1/...`. Interactive docs live at `/api/v1/docs` (OpenAPI 3 + Swagger UI).
- **One Postgres** as the system of record; **Redis** for session state.
- **Docker Compose** runs API, web, worker, Postgres, Redis, Mailpit, RabbitMQ. Reviewers need Docker plus optional Stripe CLI.

**Why this fits Part 2 and still scales**

- A three-part shop does not yet have independent teams or independent data ownership. Microservices would add extra failure modes and harder reviews without buying real scale.
- The API is stateless aside from Redis, so I can run more API containers when traffic grows.
- Part 2 added `apps/worker` that consumes RabbitMQ **without** splitting the catalog database. Payment webhooks publish `payment.status`; the worker updates the order, sends email, and restores inventory. If payment volume later needs its own process, that module is already a boundary.

**What I would not do yet:** a separate “User Service” and “Product Service” with two databases. Joining products to brands/categories and later to order lines is exactly what one relational database is for.

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
4. That outcome is published to RabbitMQ. Stripe ids plus AES-256-GCM snapshots of address and contact are stored in Postgres — never PAN, expiry, or CVC. Public TLS is the `tls` nginx service. The worker, not the webhook request, sends email and adjusts inventory.

**Demo:** Network tab on Pay — no `card`, `cvc`, or `exp` on the shop API. Stripe test cards. Mailpit. RabbitMQ `payment.status`.

Code: `apps/web/src/pages/CheckoutPay.tsx`, `apps/api/src/services/order.service.ts`, `apps/api/src/lib/queue.ts`, `apps/api/src/worker.ts`, `apps/api/src/routes/webhooks.ts`.

---

## 9. CIA (confidentiality, integrity, availability)

| Goal | How this shop does it |
| --- | --- |
| **Confidentiality** | TLS at nginx (`https://localhost:8443`); AES-256-GCM for addresses, order snapshots, payment metadata, audit `metaEnc`; access JWT only in memory; staff 2FA; RBAC on `/admin` |
| **Integrity** | Signed JWTs; Argon2 password hashes; checkout `SELECT FOR UPDATE`; purchased-only reviews; audit log of staff writes |
| **Availability** | Docker healthchecks; Redis token-bucket (429 before the process melts); worker can scale off HTTP; k6 report in `docs/PERFORMANCE.md` |

---

## 10. Semantic HTML and accessibility

We use native landmarks (`header`, `nav`, `main`, `footer`, `aside`, `article`), one `h1` per page, `h2` for sections, real `button`s (not clickable `div`s), `label` + `for` on filters, a skip link, and `:focus-visible` outlines. Star ratings expose an `aria-label`. Contrast for body text is forest-on-paper; star glyphs use a darker gold (`#7a5a12`) so they stay readable. Font sizes are `rem`, so 200% zoom still reflows (header stacks under 600px).

---

## 11. Part 3 tests (reviews, admin, rate limit)

- Unit: `apps/api/src/lib/review.test.ts` (average + Zod), `apps/api/src/lib/rate-limit.test.ts` (Redis token bucket).
- API: `apps/api/test/reviews.api.test.ts` (403 without purchase, 201 after a paid order, sort + vote).
- Admin: `apps/api/test/admin.api.test.ts` (MFA required, CRUD, bulk JSON, refuse staff role without 2FA).
- Security: unauthenticated `/admin/users` is 401.

Demo: `docker compose exec api pnpm test`. For load: `docker compose --profile load run --rm k6` and open `docs/PERFORMANCE.md`.

---

## Quick demo script (same as README, with “explain” beats)

1. `./scripts/start.sh` → https://localhost:8443 (accept the cert) or http://localhost:8088, Mailpit http://localhost:8025.
2. Login `customer@volt.test` / `Shopping123`. Show empty Local Storage. Open jwt.io on an access token from the Network tab (header / payload / signature).
3. Call refresh twice with the **first** refresh token (or use the automated test) — second call 401 “reuse”.
4. Catalog facets + sort + typeahead + grid/list; open a PDP (thumbs + full, metric/imperial, reviews).
5. Leave/vote a review on the seeded Sony purchase; average updates.
6. Guest: add to cart, refresh, still there; header quick cart. Sign in: cart merges.
7. Checkout: prefill, bad postcode field error, Pay with `4242…4242`; confirmation shows `VC-` reference + estimated delivery; Mailpit HTML.
8. Admin `admin@volt.test` + TOTP `DEMOADMIN2FASECRETKEYAA`: CRUD, bulk CSV, hide a review, change shipment, refuse a role until 2FA.
9. Contact form → Mailpit; unknown URL → 404; burst `/auth/login` → 429.
10. `docker compose exec api pnpm test` then k6 + `docs/PERFORMANCE.md`. Walk ACID, PCI, CIA, semantic HTML.
