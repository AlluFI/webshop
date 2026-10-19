# Voltie (customer shop assistant)

Voltie is the customer-facing assistant on the storefront (bottom-right). Staff wingman tools are not in this slice.

## What shoppers can do

| Caller | Allowed | Blocked |
| --- | --- | --- |
| Guest | Catalog search, shipping/returns/warranty/payments/promos, open an enquiry with an email | Any order lookup |
| Signed-in customer | That plus **their** orders, a confirmed claim | Other people’s orders |
| Staff using the shop widget | Catalog + enquiry | Customer order lookup (use Admin for that) |

Order lookup is never done by email alone.

## Tickets without Jira

`TICKET_MODE=mock` (default) writes a `support_tickets` row and emails **support@localhost** with a Jira-shaped issue (`project: VOLT`, `issuetype`, `summary`, `description`, `labels`). Mailpit on port 8025 is the demo “Jira”. Admin → **Tickets** (admin, support) shows the same queue (`VD-…` plus a would-be `VOLT-n` key).

`TICKET_MODE=live` plus `TICKET_WEBHOOK_URL` also POSTs that JSON to a real Jira/automation webhook. Local rows stay so the inbox still works if the webhook fails.

## Claims

A signed-in customer can ask Voltie to open a claim. Voltie shows **Confirm claim**. That button sets the order to **CLAIMS** (picking pauses) and opens a claim ticket. The model/rules never flip status without that confirm.

## Demo

1. Open http://localhost:8088 and click **Voltie**.
2. Guest: “Do you sell Sony headphones?”, “How long is shipping?”, “Please email support … reply to you@example.com”.
3. Sign in as `customer@volt.test` and ask about a damaged order; confirm the claim.
4. Mailpit + Admin → Tickets show the mock Jira payload.
