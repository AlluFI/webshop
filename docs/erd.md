# Entity relationship diagrams

Cardinality: `1` = one, `*` = many. Modality: a `0..1` relationship is optional.

## Part 1 — implemented

```mermaid
erDiagram
  Role ||--o{ User : assigns
  User ||--o| TotpSecret : has
  User ||--o{ OAuthIdentity : links
  User ||--o{ PasswordResetToken : requests
  User ||--o{ EmailVerificationToken : confirms
  Category ||--o{ Product : contains
  Category ||--o{ Category : parent
  Brand ||--o{ Product : makes
  Wholesaler ||--o{ Product : supplies
  Wholesaler ||--o{ PurchaseOrder : receives
  PurchaseOrder ||--o{ PurchaseOrderItem : lists
  Product ||--o{ PurchaseOrderItem : restocked
  Product ||--o{ ProductImage : has
  Product ||--o{ ProductAttribute : has

  Role {
    uuid id PK
    string name UK
  }
  User {
    uuid id PK
    string email UK
    string passwordHash
    uuid roleId FK
    boolean totpEnabled
  }
  TotpSecret {
    uuid id PK
    uuid userId FK
    string secret
    json backupCodes
  }
  OAuthIdentity {
    uuid id PK
    uuid userId FK
    string provider
    string providerUserId
  }
  Category {
    uuid id PK
    string slug UK
    uuid parentId FK
  }
  Brand {
    uuid id PK
    string slug UK
  }
  Wholesaler {
    uuid id PK
    string slug UK
    string email UK
  }
  PurchaseOrder {
    uuid id PK
    string reference UK
    uuid wholesalerId FK
  }
  PurchaseOrderItem {
    uuid id PK
    uuid purchaseOrderId FK
    uuid productId FK
    int quantity
  }
  Product {
    uuid id PK
    string slug UK
    decimal price
    decimal wholesalePrice
    decimal vatRate
    int stockQuantity
    uuid categoryId FK
    uuid brandId FK
    decimal weightKg
    decimal weightLb
    decimal lengthCm
    decimal widthCm
    decimal heightCm
    decimal lengthIn
    decimal widthIn
    decimal heightIn
    float averageRating
  }
  ProductImage {
    uuid id PK
    uuid productId FK
    string path
    string altText
  }
```

Refresh sessions (access `jti` denylist, rotating refresh `fam`/`jti`) live in **Redis**, not PostgreSQL, so rotation and revocation stay O(1) and single-use.

## Part 2 — commerce (implemented)

Guest carts are keyed by an httpOnly `cart_token` cookie (hashed in Postgres, 30-day TTL). Logged-in users have one persistent cart. Login merges the guest cart and clamps quantities to stock. Address, contact, and payment metadata columns store AES-256-GCM ciphertext. Stripe payment outcomes are published to RabbitMQ (`payment.status`); the worker consumes them, emails the shopper, and restores stock on failure. Poison messages dead-letter to `payment.status.dlq`.

```mermaid
erDiagram
  User ||--o{ Address : stores
  User ||--o| Cart : owns
  Cart ||--o{ CartItem : contains
  Product ||--o{ CartItem : referenced
  User ||--o{ Order : places
  Order ||--o{ OrderItem : contains
  Order ||--o{ OrderStatusEvent : tracks
  Order ||--o| Payment : paidBy
  Order }o--o| Address : shipsTo
  Product ||--o{ OrderItem : referenced
  Product ||--o{ InventoryReservation : reservedBy
  Order ||--o{ InventoryReservation : holds

  Address {
    uuid id PK
    uuid userId FK
    string recipientNameEnc
    string line1Enc
    string cityEnc
    string postalEnc
    string country
  }
  Cart {
    uuid id PK
    uuid userId FK
    string guestToken UK
    datetime expiresAt
  }
  CartItem {
    uuid id PK
    uuid cartId FK
    uuid productId FK
    int quantity
  }
  Order {
    uuid id PK
    uuid userId FK
    string status
    decimal total
    string shippingAddressEnc
    string contactEmailEnc
  }
  OrderItem {
    uuid id PK
    uuid orderId FK
    uuid productId FK
    int quantity
    decimal unitPrice
  }
  Payment {
    uuid id PK
    uuid orderId FK
    string stripePaymentIntentId
    string status
    string metadataEnc
  }
```

## Part 3 — implemented

Reviews are purchased-only (`PAID` / `PROCESSING` / `SHIPPING` / `WITH_COURIER` / `DELIVERED`). Helpful votes are unique per user. Product `averageRating` / `reviewCount` are recalculated from published reviews. Staff actions write an encrypted audit row. Shipping options are editable in admin.

```mermaid
erDiagram
  Product ||--o{ Review : receives
  User ||--o{ Review : writes
  Review ||--o{ ReviewVote : scoredBy
  User ||--o{ ReviewVote : casts
  User ||--o{ AuditLog : records
  User }o--|| Role : has

  Review {
    uuid id PK
    uuid productId FK
    uuid userId FK
    int stars
    string body
    int helpfulCount
    string status
  }
  ReviewVote {
    uuid id PK
    uuid reviewId FK
    uuid userId FK
  }
  AuditLog {
    uuid id PK
    uuid actorId FK
    string action
    string entity
    string metaEnc
  }
  ShippingOption {
    uuid id PK
    string code UK
    decimal price
    int minDays
    int maxDays
  }
```
