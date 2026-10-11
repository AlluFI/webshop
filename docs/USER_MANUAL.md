# Volt & Co staff user manual

This guide is for people who work in **Admin** (`/admin`). Customers never see these tabs. Staff sign in with email and password, then a six-digit authenticator code (2FA is required for every staff account).

Demo logins (password `Shopping123`, TOTP secret `DEMOADMIN2FASECRETKEYAA`):

| Role | Email | What they are for |
| --- | --- | --- |
| **admin** | `admin@volt.test` | Full shop: catalog, warehouse, orders, users, reviews |
| **sales** | `sales@volt.test` | Catalog, warehouse buying, orders, shipping |
| **support** | `support@volt.test` | Customer orders, refunds, review moderation |
| **warehouse** | `warehouse@volt.test` | Products, orders, and picking only |

Open Admin at http://localhost:8088/admin (or https://localhost:8443/admin). The page is grouped as **Product**, **Orders**, and **Admin**. Menus you are not allowed to use are hidden.

- **Product:** products, categories, wholesalers, shipping
- **Orders:** orders, picking, sales
- **Admin:** users, reviews, bulk, log

Order numbers are the same everywhere: **`VC-` plus eight uppercase characters** (for example `VC-23AAA1B2`). That number is what you see on Orders, Picking, the customer order page, and Mailpit emails.

---

## Who sees which tab

| Section / tab | admin | sales | support | warehouse |
| --- | :---: | :---: | :---: | :---: |
| products | yes | yes | — | yes |
| categories | yes | yes | — | — |
| orders | yes | yes | yes | yes |
| sales | yes | yes | yes | — |
| picking | yes | yes | yes | yes |
| wholesalers | yes | yes | — | — |
| users | yes | — | — | — |
| reviews | yes | — | yes | — |
| shipping | yes | yes | — | — |
| bulk | yes | yes | — | — |
| log | yes | yes | yes | — |

Refunds on the **orders** tab are **admin** and **support** only. Sales and warehouse can change status and hand an order to the courier, but cannot refund.

Customers have no Admin access.

---

## products

**Who:** admin, sales, warehouse

Catalog of products on the shop.

- Table: name, retail price, wholesale price, margin, stock, category, warehouse locator (`01|02|2|1`), barcode, wholesaler
- **Add product** / **Edit**: name, description, retail price (includes 25.5% Finnish VAT), wholesale price, VAT %, live net/VAT/margin, stock, category slug, brand, featured flag, locator (station, block, shelf, place), wholesaler, wholesale SKU, barcode (EAN-13 / UPC / warehouse code)
- The shop always shows the retail price. Confirmation, checkout, and the paid email list VAT as its own included row.
- **Receive stock**: scan or type a barcode once, then enter how many pieces arrived (you do not scan each unit)
- Upload a product photo
- Delete a product

The locator is where the item sits in the warehouse. The barcode is what a scanner reads on the box. Seeded products use Finland GS1 codes starting with `640`.

---

## categories

**Who:** admin, sales

Shop categories used on the catalog filters.

- List of categories (name, slug, description)
- Create, edit, delete

---

## orders

**Who:** admin, support, sales, warehouse (refunds: admin, support)

Every customer order, newest first.

- Table: order number (`VC-…`), **Paid** date (Helsinki time, or a dash if never paid), status, total, product summary, tracking
- Change status with the dropdown
- **Courier** / **Tracking** on Shipping or With the courier: carrier (Posti, PostNord, Budbee), tracking number, delivery window. That emails the customer and sets status to **With the courier**
- **Refund** (admin/support): reason required; Stripe sandbox refund; stock comes back if it was still reserved

Statuses in order:

1. Pending payment
2. Payment failed (or Paid)
3. Processing (after staff press **Process** on Picking)
4. Shipping (after pick is confirmed)
5. With the courier (after tracking is saved)
6. Delivered

Cancelled and Refunded are end states.

---

## sales

**Who:** admin, support, sales

Revenue reporting for paid through delivered orders (Helsinki calendar).

- Filter by all products, one category, or one product
- Time frames: last 7 / 30 days, last 12 months, this/last calendar week, month, and year
- Group by day, calendar week, calendar month, or calendar year (Auto picks a sensible default)
- KPI cards for revenue, orders, units, included VAT, and margin
- Bar chart plus a period table

---

## picking

**Who:** admin, support, sales, warehouse

Warehouse pick list for paid work.

- Lists **Paid** and **Processing** orders, oldest first
- Open a row: locator codes, barcodes, and quantities
- Lines stay locked until **Process** (status becomes **Processing**)
- Tick every line by hand, or scan a barcode (USB scanner, or Use camera — on a phone this takes a photo). Scanning only ticks a matching line; checkboxes still work
- **Order completed**, confirm quantities
- Confirmed pick moves the order to **Shipping** and removes it from this list

---

## wholesalers

**Who:** admin, sales

Suppliers and warehouse restock.

- List: name, order email, product count, low-stock count
- **Add wholesaler** / **Edit**: name, email, contact, phone, address, notes
- Assign a wholesaler and wholesale SKU on each product (Products tab)
- **Order stock**: set quantities, optional note, **Send restock order**
- Mailpit receives the purchase order (`VCPO-…`) at the supplier email (http://localhost:8025)
- Sending the email does **not** increase stock; that happens when the goods arrive and you edit stock on Products

Seeded suppliers: ElectroNordic Oy (audio, wearables, phones), Baltic IT Wholesale (computers, accessories), Nordic Lighting Supply (smart home).

---

## users

**Who:** admin

Accounts and roles.

- Table: name, email, 2FA on/off, role
- Filter by role: all accounts, **All employees** (admin, support, sales, warehouse), or one role
- **Add employee**: name, work email, staff role, temporary password. The account is verified and 2FA is turned on immediately. After save, copy the QR / authenticator secret and backup codes once and give them to the new person with the password.
- Change role: customer, admin, support, sales, warehouse
- Promoting an existing customer to a staff role still requires that they already have 2FA enabled (Account page)

---

## reviews

**Who:** admin, support

Product reviews from customers who bought the item.

- Table: stars, product, author, status, text
- **Hide** or **Publish**

Hidden reviews do not count toward the product average.

---

## shipping

**Who:** admin, sales

Checkout shipping options (Standard, Express).

- Name, description, price, free-shipping threshold, min/max days, active flag
- Edit an option; inactive options are hidden at checkout

---

## bulk

**Who:** admin, sales

Create many products at once.

- Upload CSV or JSON
- CSV headers: `name`, `description`, `price`, `stockQuantity`, `category`, `brand`, `weightKg`, `lengthCm`, `widthCm`, `heightCm`
- JSON is an array of the same fields
- Result shows how many rows were created and any row errors

---

## log

**Who:** admin, support, sales

Staff change history (who changed what, old value → new value).

- Filter by entity: product, category, order, review, shipping, wholesaler, purchase order
- Paginated list with time, actor, and field diffs

---

## Storefront (not Admin tabs)

Customers use the public site: Home, Catalog, product pages, Cart, Checkout, Account, Orders, About, Contact, FAQ, Terms. Staff (admin, sales, support, warehouse) can open Catalog and product pages to see the customer view, but Cart, Checkout, Add to cart, and customer Orders are hidden or disabled so staff cannot buy from the shop. Staff 2FA is set under **Account**. Contact form and order mail land in Mailpit.
