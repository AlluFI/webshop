# Performance report (Part 3)

Load tests live in `load-tests/shop.js` (k6). They run against the Docker storefront proxy so the path matches a reviewer hitting nginx, not a raw Node process on a laptop.

Each virtual user sends a unique `X-Forwarded-For` address so the token-bucket (keyed per IP) models 50 shoppers rather than one NAT’d client. A first run without that header failed ~74% of API calls with 429s while p90 stayed under 20ms — the limiter was doing its job, not the CPU.

## How to run

```bash
./scripts/start.sh
docker compose --profile load run --rm --no-deps k6
```

`BASE_URL` defaults to `http://web:80` inside Compose. `--no-deps` avoids recreating the API mid-run (that also produces false 502/429s). Override if you point k6 at TLS:

```bash
docker compose --profile load run --rm --no-deps -e BASE_URL=https://tls:443 k6
```

(self-signed: add `insecureSkipTLSVerify: true` in the script if you switch the target).

## Scenarios

| Name | What it models | Executor |
| --- | --- | --- |
| `browse` | Home HTML + catalog JSON | Ramp to 50 VUs |
| `searchCart` | Typeahead, faceted search, add-to-cart, cart read | 15 VUs constant |
| `auth` | Login (`customer@volt.test`) | 5 arrivals/sec |

Checkout with Stripe is **not** in the automated mix: sandbox keys and Payment Element are browser-bound. Use the demo script for that path.

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
| Max users before p95 > 5s | identify | **Not reached at 64 VUs** on this machine |
| CPU/memory > 90% load | identify | **Not reached.** After the run: API ~111 MiB / 3% CPU, Postgres ~92 MiB. RabbitMQ management sat ~54% CPU briefly; nothing crossed 90%. |

Normal operating load for this shop is a handful of browsers (catalog + PDP + cart). Expected peak for a class review or small promo is the k6 mix: ~50 concurrent catalog readers. Breaking latency (p95 > 5s) and 90% CPU were not observed at 64 VUs / 112 rps; the next experiment would be 200+ VUs or an Argon2-only login flood.

## Bottlenecks and fixes

| Bottleneck | Why it shows up | What we would do next |
| --- | --- | --- |
| Shared IP rate limits | Token buckets are per `X-Forwarded-For`. One NAT IP looks like one attacker. | Keep per-IP buckets; k6 must use distinct forwarded addresses (the script does). |
| Catalog `groupBy` facets on every list | Prisma facet counts scan products per request | Cache facet JSON in Redis for 30–60s; add covering indexes |
| Full-text `search_vector` + Prisma round-trip | Relevance sort does a raw SQL then `findMany` by ids | Return columns in the raw query; skip the second fetch |
| Image originals served from the API | Node streams files from the upload volume | Let nginx/tls serve `/api/v1/files` from the volume; keep thumbs at 400px |
| Login Argon2 | CPU-bound per attempt | Token-bucket already caps bursts; add more API replicas |
| Stripe + RabbitMQ checkout | Not in k6; worker is a single consumer | Scale `worker` replicas on `payment.status` |
| Postgres connections from API+worker | Default pool is small | PgBouncer in front of Postgres before 100+ VUs |

Vertical first (indexes, Redis facet cache, nginx static files), then extra API/worker containers. The modular monolith already isolates catalog reads from the payment worker.
