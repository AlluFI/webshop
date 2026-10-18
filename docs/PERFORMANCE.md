# Performance report (Part 3)

Load tests are kept in `load-tests/shop.js` (k6). They are run against the Docker Next storefront so the path matches a reviewer hitting nginx, not a raw Node process on a laptop.

A unique `X-Forwarded-For` address is sent by each virtual user so the token-bucket (keyed per IP) models 50 shoppers rather than one NAT’d client. A first run without that header failed ~74% of API calls with 429s while p90 stayed under 20ms — the limiter was doing its job, not the CPU.

## How to run

```bash
./scripts/start.sh
docker compose --profile load run --rm --no-deps k6
```

`BASE_URL` is set to `http://web:3000` in Compose (the Next storefront listens on 3000). `--no-deps` is used so the API is not recreated mid-run (that also produces false 502/429s). TLS is targeted if the following override is used:

```bash
docker compose --profile load run --rm --no-deps -e BASE_URL=https://tls:443 k6
```

(self-signed: add `insecureSkipTLSVerify: true` in the script if you switch the target).

## Scenarios

| Name | What it models | Executor |
| --- | --- | --- |
| `browse` | Home HTML + catalog JSON | Ramp to 50 VUs |
| `searchCart` | Typeahead, faceted search, add-to-cart, cart read | 15 VUs constant |
| `checkout` | Guest cart + `/checkout/quote` + `/checkout/validate` | 8 VUs constant |
| `auth` | Login (`customer@volt.test`) | 5 arrivals/sec |

Stripe Payment Element confirm is left to the browser demo. The shop APIs that reserve a quote (address, shipping, totals) are covered by the k6 checkout path without a card being posted.

A second profile ramps browse to **200 VUs** to look for the p95 > 5s cliff:

```bash
docker compose --profile load run --rm --no-deps -e K6_PROFILE=stress k6
```

## Targets vs measured

**Host:** Docker Compose on a Mac (2026-09-14). Peak mix ~64 concurrent VUs (50 browse + 15 search + 10 auth). Duration 1m20s.

| Objective | Target | Measured |
| --- | --- | --- |
| 90% of requests | within 2s | **p90 = 58.8 ms** |
| 95% of requests | within 5s | **p95 = 102.9 ms** (max 1.7 s) |
| Concurrent users without degradation | at least 50 | 50 browse VUs + 15 search + 10 auth; p95 stayed ~103 ms |
| Peak throughput | at least 10 TPS | **112 HTTP req/s** (48 iterations/s) |
| Successful transactions | 98% under high traffic | **100%** (9049/9049 checks) |
| Error rate | under 5% | **0.00%** |
| Max users before p95 > 5s | identify | Review mix: not reached at 64 VUs. Stress profile (`K6_PROFILE=stress`): see below |
| CPU/memory > 90% load | identify | Review mix: not reached (API ~111 MiB / 3% CPU). Stress: re-check after the 200 VU run |

Normal operating load for this shop is a handful of browsers (catalog + PDP + cart). Expected peak for a class review or small promo is the k6 mix: ~50 concurrent catalog readers plus a few checkouts.

## Bottlenecks and fixes

| Bottleneck | Why it shows up | What is done next |
| --- | --- | --- |
| Shared IP rate limits | Token buckets are per `X-Forwarded-For`. One NAT IP looks like one attacker. | Keep per-IP buckets; k6 must use distinct forwarded addresses (the script does). |
| Catalog `groupBy` facets on every list | Prisma facet counts scan products per request | **Done:** Redis cache (`facets:v1:{ver}:…`, 45s TTL); admin product/category writes bump `facets:ver` |
| Full-text `search_vector` + Prisma round-trip | Relevance sort does a raw SQL then `findMany` by ids | Return columns in the raw query; skip the second fetch |
| Image originals served from the API | Node streams files from the upload volume | **Done:** nginx `web` serves `/api/v1/files/` from `uploads_data` (7-day cache). API remains the fallback if the file is missing |
| Login Argon2 | CPU-bound per attempt | Token-bucket already caps bursts; add more API replicas |
| Stripe + RabbitMQ checkout | Not in k6; worker is a single consumer | Scale `worker` replicas on `payment.status` |
| Postgres connections from API+worker | Default pool is small | PgBouncer in front of Postgres before 100+ VUs |

Vertical first (indexes, Redis facet cache, nginx static files), then extra API/worker containers. The modular monolith already isolates catalog reads from the payment worker.
