# Volt & Co staff user manual

This guide is intended for staff who work in **Admin** (`/admin`). These tabs are not shown to customers. Staff accounts are signed in with email and password, then a six-digit authenticator code. Two-factor authentication is required for every staff account.

Demo logins (password `Shopping123`, TOTP secret `DEMOADMIN2FASECRETKEYAA`):

| Role | Email | Access |
| --- | --- | --- |
| **admin** | `admin@volt.test` | Full shop: catalog, warehouse, orders, users, reviews |
| **sales** | `sales@volt.test` | Catalog, warehouse buying, orders, shipping |
| **support** | `support@volt.test` | Customer orders, refunds, review moderation |
| **warehouse** | `warehouse@volt.test` | Products, orders, and order handling |

Admin is opened at http://localhost:8088/admin (or https://localhost:8443/admin). The page is grouped as **Product**, **Orders**, **Reports**, **Shipping**, and **Admin**. Menus that are not permitted for the signed-in role are hidden.

- **Product:** products, categories, wholesalers
- **Orders:** orders, order handling
- **Reports:** overview, sales, customers
- **Shipping:** methods, packages
- **Admin:** users, reviews, bulk, log

Order numbers are formatted as **`VC-` plus eight uppercase characters** (for example `VC-23AAA1B2`). The same reference is shown on Orders, Order handling, the customer order page, and Mailpit emails.

After a successful password check, a separate two-factor form is mounted. Authenticator and backup-code fields are left empty; the email and password from the previous step are not reused.

---

## Who sees which tab

| Section / tab | admin | sales | support | warehouse |
| --- | :---: | :---: | :---: | :---: |
| products | yes | yes | — | yes |
| categories | yes | yes | — | — |
| orders | yes | yes | yes | yes |
| overview | yes | yes | yes | — |
| sales | yes | yes | yes | — |
| customers | yes | yes | yes | — |
| order handling | yes | yes | yes | yes |
| wholesalers | yes | yes | — | — |
| users | yes | — | — | — |
| reviews | yes | — | yes | — |
| shipping | yes | yes | — | — |
| bulk | yes | yes | — | — |
| log | yes | yes | yes | — |

Refunds on the **orders** tab are limited to **admin** and **support**. Status changes and courier hand-off are allowed for sales and warehouse. Refunds are not allowed for those roles.

Admin access is not granted to customer accounts.

---

## products

**Who:** admin, sales, warehouse

The catalog of products sold in the shop is managed here.

- Table: name, retail price, wholesale price, margin, stock, category, warehouse locator (`01|02|2|1`), barcode, wholesaler
- **Add product** / **Edit**: name, description, retail price (25.5% Finnish VAT included), wholesale price, VAT %, live net/VAT/margin, stock, category slug, brand, featured flag, locator (station, block, shelf, place), wholesaler, wholesale SKU, barcode (EAN-13 / UPC / warehouse code)
- **Product information**: model, color, release year, energy class, warranty months and note, manufacturer product page, brand website, key highlights, what’s in the box, and extra name/value specifications
- The shop product page shows those fields as highlights, warranty, manufacturer/brand links, and a product information table
- The retail price is shown on the shop. VAT is listed as its own included row on confirmation, checkout, and the paid email.
- **Receive stock**: a barcode is scanned or typed once, then the arrived quantity is entered (each unit is not scanned)
- A product photo may be uploaded
- A product may be deleted

The locator is the warehouse place of the item. The barcode is the value read from the box. Seeded products use Finland GS1 codes starting with `640`.

---

## categories

**Who:** admin, sales

Shop categories used on the catalog filters are managed here.

- List of categories (name, slug, description)
- Create, edit, and delete

---

## orders

**Who:** admin, support, sales, warehouse (refunds: admin, support)

Every customer order is listed, newest first.

- Table: order number (`VC-…`), customer name, **Paid** date (Helsinki time, or a dash if never paid), status, total, stacked product summary, tracking
- Status is changed with the dropdown
- **Courier** / **Tracking** on Shipping or With the courier: carrier (Posti, PostNord, Budbee), tracking number, delivery window. The customer is emailed and the status is set to **With the courier**
- **Refund** (admin/support): a reason is required; a Stripe sandbox refund is created; reserved stock is returned

Statuses in order:

1. Pending payment
2. Payment failed (or Paid)
3. Processing (after **Process** is pressed on Order handling)
4. Shipping (after the pick is confirmed)
5. With the courier (after tracking is saved)
6. Delivered

Cancelled and Refunded are end states.

---

## overview

**Who:** admin, support, sales

Shop-wide money for paid-through-delivered orders on the Helsinki calendar. Refunded orders in the same window are shown as a separate refunds figure, not subtracted from product sales.

- **Customer amount** is what buyers paid (`order.total`: products + shipping, VAT included)
- **Product sales** is the sum of line totals
- **Shipping**, **VAT included**, **net of VAT**, **refunds**, **net sales**, and **margin**
- Orders, units, AOV, and unique customers
- Time frames and grouping match **sales**
- A period table with those money columns

---

## sales

**Who:** admin, support, sales

Product and category sales for paid-through-delivered orders on the Helsinki calendar.

- Filters: all products, one category, or one product
- Time frames: last 7 / 30 days, last 12 months, this/last calendar week, month, and year
- Grouping: day, calendar week, calendar month, or calendar year (Auto selects a default)
- KPI cards for product sales, orders, units, included VAT, and margin
- A bar chart and a period table

---

## customers

**Who:** admin, support, sales

Buyers on paid-through-delivered orders in the selected time frame. Signed-in shoppers are grouped by account; guests are grouped by the order contact email.

- Unique customers, new vs returning in the range, customer amount, and AOV
- Top buyers by spend: name, email, orders, units, customer amount

---

## order handling

**Who:** admin, support, sales, warehouse

Warehouse pick and ship work is listed here.

- **Paid**, **Processing**, and **Shipping** orders are listed with **express first** (oldest to newest), then standard (oldest to newest). Express rows show a red **! Express** mark
- A row is opened for locator codes, barcodes, quantities, and the delivery address
- Lines stay locked until **Process** (status becomes **Processing**)
- Each line is ticked by hand, or a barcode is scanned (USB scanner, or Use camera on a phone). A scan only ticks a matching line; checkboxes remain available
- **Order completed** is used, then quantities are confirmed
- A confirmed pick moves the order to **Shipping**. The order **stays on this list** until it is handed to the courier
- **Create label** / **Print label** calls `POST /api/v1/admin/orders/{id}/shipment`. A carrier adapter is selected (Posti, PostNord, or Budbee). In mock mode a Volt HTML label and a demo tracking code are returned. The same request shape is used later when `POSTI_MODE`, `POSTNORD_MODE`, or `BUDBEE_MODE` is set to `live`
- **Hand to courier** saves tracking, emails the customer, and removes the order from this list. The order remains under **Orders**

---

## wholesalers

**Who:** admin, sales

Suppliers and warehouse restock are managed here.

- List: name, order email, product count, low-stock count
- **Add wholesaler** / **Edit**: name, email, contact, phone, address, notes
- A wholesaler and wholesale SKU are assigned on each product (Products tab)
- **Order stock**: quantities are set, an optional note is added, then **Send restock order** is used
- A purchase order (`VCPO-…`) is received in Mailpit at the supplier email (http://localhost:8025)
- Stock is not increased by the email. Stock is increased when the goods arrive and the product is updated

Seeded suppliers: ElectroNordic Oy (audio, wearables, phones), Baltic IT Wholesale (computers, accessories), Nordic Lighting Supply (smart home).

---

## users

**Who:** admin

Accounts and roles are managed here.

- Table: name, email, 2FA on/off, role
- Filter by role: all accounts, **All employees** (admin, support, sales, warehouse), or one role
- **Add employee**: name, work email, staff role, temporary password. The account is verified and 2FA is enabled immediately. After save, the QR / authenticator secret and backup codes are copied once and given to the new person with the password
- Customer roles cannot be changed. New staff are created with **Add employee**
- Staff role changes (admin, support, sales, warehouse, or back to customer) ask for confirmation first

---

## reviews

**Who:** admin, support

Product reviews from customers who bought the item are moderated here.

- Table: stars, product, author, status, text
- **Hide** or **Publish**

Hidden reviews are excluded from the product average.

---

## shipping

**Who:** admin, sales

Checkout shipping options (Standard, Express) are edited here.

- Name, description, price, free-shipping threshold, min/max days, active flag
- An option is edited; inactive options are hidden at checkout

---

## bulk

**Who:** admin, sales

Many products are created at once.

- CSV or JSON is uploaded
- CSV headers: `name`, `description`, `price`, `stockQuantity`, `category`, `brand`, `weightKg`, `lengthCm`, `widthCm`, `heightCm`
- JSON is an array of the same fields
- The result shows how many rows were created and any row errors

---

## log

**Who:** admin, support, sales

Staff change history is listed (who changed what, old value → new value).

- Filter by entity: product, category, order, review, shipping, wholesaler, purchase order
- Paginated list with time, actor, and field diffs

---

## Storefront (not Admin tabs)

The public site is used by customers: Home, Catalog, product pages, Cart, Checkout, Profile, Orders, About, Contact, FAQ, Terms. Catalog and product pages may be opened by staff (admin, sales, support, warehouse) to see the customer view. Cart, Checkout, Add to cart, and customer Orders are hidden or disabled so staff cannot buy from the shop. Signed-in customers open **Profile** and **Orders** from their name in the header. Staff 2FA is set under **Profile**. Contact form and order mail are delivered to Mailpit.
