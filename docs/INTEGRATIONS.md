# Integrations and BI

Volt & Co is ready for warehouse BI (Metabase, Looker, Power BI) and SaaS connectors without a rewrite. Production cutover is configuration, not new product work.

There are three supported paths. Use one or all of them.

| Path | Best for | How |
| --- | --- | --- |
| SQL views | Internal warehouse / replica dashboards | Read `analytics_*` on a replica |
| Integration API | Cloud BI, iPaaS, custom ETL | `GET /api/v1/integrations/v1/*` with a machine key |
| Signed webhooks | Near-real-time SaaS (CRM, ERP, marketing) | Admin → Integrations → webhook URL |

Admin keys and webhooks are created under **Admin → Integrations** (admin role only). The plaintext token and webhook secret are shown once.

## SQL warehouse views

These views exclude encrypted contact and address columns. Point Metabase / Power BI / Looker at a **read replica**, not the primary.

| View | Contents |
| --- | --- |
| `analytics_orders` | Order id, `VC-` reference, customer id, status, money, shipping method, timestamps |
| `analytics_order_items` | Line items with product id, name, quantity, unit/line totals, barcode |
| `analytics_products` | Catalog facts: price, promo price, stock, category/brand ids, barcode |
| `analytics_customers` | Customer ids, marketing opt-in, deleted/retain dates (no email) |
| `analytics_order_events` | Status history |

Suggested replica user:

```sql
CREATE USER bi_reader WITH PASSWORD '...';
GRANT CONNECT ON DATABASE voltco TO bi_reader;
GRANT USAGE ON SCHEMA public TO bi_reader;
GRANT SELECT ON analytics_orders, analytics_order_items, analytics_products, analytics_customers, analytics_order_events TO bi_reader;
```

Incremental loads: filter `updated_at >= :watermark` on `analytics_orders` and `analytics_products`.

## Machine API

Keys are stored as SHA-256 hashes. Prefixes:

- `volt_test_…` when `NODE_ENV` is not `production`
- `volt_live_…` when `NODE_ENV=production`

Send the token as `Authorization: Bearer volt_…` or `X-Api-Key: volt_…`.

| Scope | Endpoints |
| --- | --- |
| `orders` | `/api/v1/integrations/v1/orders`, `/order-items` |
| `catalog` | `/api/v1/integrations/v1/products` |
| `customers` | `/api/v1/integrations/v1/customers` |
| `pii` | Adds `email` and `displayName` on the customers export |

Default keys omit `pii`. Encrypted order contact fields are never exported.

Query parameters on every export:

- `updatedSince` — ISO-8601 watermark
- `cursor` — opaque next page from the previous response
- `limit` — 1–200 (default 100)

Example:

```bash
curl -sS -H "X-Api-Key: $VOLT_KEY" \
  "https://shop.example.com/api/v1/integrations/v1/orders?updatedSince=2026-01-01T00:00:00.000Z&limit=100"
```

Page until `nextCursor` is `null`.

## Webhooks

Events: `order.paid`, `order.updated`, `customer.deleted`.

`order.paid` is also emitted as `order.updated`. Sources: Stripe payment success, staff status changes, refunds, and explicit cancel. Abandoned unpaid checkouts do not fire.

Each delivery is `POST` JSON with:

- `X-Volt-Event`
- `X-Volt-Timestamp` (unix seconds)
- `X-Volt-Signature` — `hex(HMAC-SHA256(secret, timestamp + "." + rawBody))`

Verify the signature before trusting the payload. Delivery is best-effort (4s timeout). Last HTTP status and error are shown on the Integrations tab. A durable retry queue is not included; BI tools should also poll the export API.

## Production cutover

1. Set `NODE_ENV=production` so new keys use the `volt_live_` prefix.
2. Keep `DATA_ENCRYPTION_KEY` stable. Webhook secrets are encrypted with it.
3. Create keys in Admin → Integrations. Copy the token into the BI / iPaaS secret store. Revoke unused keys.
4. Grant warehouse tools a replica login on the `analytics_*` views only.
5. Register HTTPS webhook URLs. `http://localhost` is allowed only for development.
6. Do not give integration keys staff JWTs or the encryption key.

OpenAPI: http://localhost:3000/api/v1/docs (tag **Integrations**).
