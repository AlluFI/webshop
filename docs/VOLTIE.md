# Voltie (shop assistant and staff wingman)

Voltie is rule-based (no LLM keys). The shop FAB is for customers. Staff get a separate FAB on **Admin**.

## Shop widget

| Caller | Allowed | Blocked |
| --- | --- | --- |
| Guest | Catalog search, shipping/returns/warranty/payments/promos, open an enquiry with an email | Any order lookup |
| Signed-in customer | That plus **their** orders, a confirmed claim | Other people’s orders |
| Staff | Shop widget is hidden — use Admin Voltie | — |

Order lookup is never done by email alone. If a shopper needs help with an order (missing parts, ripped parcel, “the product is not working”), Voltie asks which order and shows tap rows. When that order has more than one product, Voltie asks which product (or the whole order) before offering a confirmed claim, so the support ticket already names the item.

## Staff widget (Admin)

Tools are filtered with `can(role, permission)`. Denied tools get a chat sentence, not a 403 on the message POST. Warehouse never sees customer email or name. Writes never happen until the staff person taps Confirm.

| Role | Typical asks |
| --- | --- |
| Warehouse | `Find VC-…`, pick list / unpicked queue, locator / barcode, low stock, who supplies a SKU. No customer email, tickets, sales, or refunds. |
| Support | Orders, customers (with their orders), tickets, pick list, locators from order lines, last 7 days sales, confirmed refund or status. No catalog search, inventory, or wholesalers. |
| Sales | Orders, customers, catalog, pick list, last 7 days sales, low stock, wholesalers. No refunds or tickets. |
| Admin | All of the above. |

`WITH_COURIER` is not confirmable from chat (carrier + tracking are required). Voltie sends staff to **Order handling**.

Confirmed writes: `POST /assistant/threads/:id/staff` with `{ action: "status" | "refund", … }`. Staff-only; customers get 403.

## Tickets without Jira

`TICKET_MODE=mock` (default) writes a `support_tickets` row and emails **support@localhost** with a Jira-shaped issue (`project: VOLT`, `issuetype`, `summary`, `description`, `labels`). Mailpit on port 8025 is the demo “Jira”. Admin → **Tickets** (admin, support) shows the same queue (`VD-…` plus a would-be `VOLT-n` key).

`TICKET_MODE=live` plus `TICKET_WEBHOOK_URL` also POSTs that JSON to a real Jira/automation webhook. Local rows stay so the inbox still works if the webhook fails.

## Claims

A signed-in customer can ask Voltie to open a claim. Voltie shows **Confirm claim**. That button sets the order to **CLAIMS** (picking pauses) and opens a claim ticket. The model/rules never flip status without that confirm.

## Demo

1. Open http://localhost:8088 and click **Voltie**. **New chat** starts a fresh thread so the previous order context is dropped.
2. Guest: “Do you sell Sony headphones?”, “How long is shipping?”, “Please email support … reply to you@example.com”.
3. Sign in as `customer@volt.test` and ask about a damaged order; confirm the claim.
4. Mailpit + Admin → Tickets show the mock Jira payload.
5. Sign in as staff (2FA). On Admin, open Voltie: “Find VC-…”, “how many unpicked order in queue?”, “show me orders for user customer@volt.test”, “Which is wholesaler for apple products?”, “What products are low on stock?”. Warehouse answers omit email. Refunds and status wait for Confirm. Emails are not spell-corrected (so `gmail.com` stays `gmail.com`).
