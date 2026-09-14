import type { OpenAPIV3 } from "openapi-types";

const error = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
    fields: {
      type: "object",
      additionalProperties: { type: "string" },
    },
  },
} satisfies OpenAPIV3.SchemaObject;

const tokenPair = {
  type: "object",
  required: ["userId", "accessToken", "refreshToken", "tokenType"],
  properties: {
    userId: { type: "string", format: "uuid" },
    accessToken: { type: "string", description: "JWT. Send as Authorization: Bearer." },
    refreshToken: {
      type: "string",
      description: "Also set as httpOnly cookie refresh_token on /api/v1/auth.",
    },
    tokenType: { type: "string", enum: ["Bearer"] },
  },
} satisfies OpenAPIV3.SchemaObject;

const publicUser = {
  type: "object",
  required: ["id", "email", "totpEnabled", "role"],
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string", format: "email" },
    displayName: { type: "string", nullable: true },
    totpEnabled: { type: "boolean" },
    emailVerifiedAt: { type: "string", format: "date-time", nullable: true },
    role: { type: "string", example: "customer" },
  },
} satisfies OpenAPIV3.SchemaObject;

const product = {
  type: "object",
  required: [
    "id",
    "name",
    "slug",
    "description",
    "price",
    "stockQuantity",
    "category",
    "brand",
    "images",
    "weightKg",
    "weightLb",
    "dimensions",
    "averageRating",
    "reviewCount",
    "featured",
    "attributes",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    slug: { type: "string" },
    description: { type: "string" },
    price: { type: "number", example: 129.0 },
    stockQuantity: { type: "integer" },
    category: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        slug: { type: "string" },
      },
    },
    brand: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        slug: { type: "string" },
      },
    },
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string", example: "/api/v1/files/sony-wh-1000xm5.jpg" },
          altText: { type: "string" },
        },
      },
    },
    weightKg: { type: "number" },
    weightLb: { type: "number" },
    dimensions: {
      type: "object",
      properties: {
        metric: {
          type: "object",
          properties: {
            lengthCm: { type: "number" },
            widthCm: { type: "number" },
            heightCm: { type: "number" },
          },
        },
        imperial: {
          type: "object",
          properties: {
            lengthIn: { type: "number" },
            widthIn: { type: "number" },
            heightIn: { type: "number" },
          },
        },
      },
    },
    averageRating: { type: "number" },
    reviewCount: { type: "integer" },
    featured: { type: "boolean" },
    attributes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "string" },
        },
      },
    },
  },
} satisfies OpenAPIV3.SchemaObject;

export const openApiDocument: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Volt & Co API",
    version: "1.0.0",
    description:
      "Part 2 storefront API: accounts, JWT sessions, optional TOTP, Google OAuth, a faceted electronics catalog, guest and logged-in carts, addresses, and checkout quotes.\n\n" +
      "Demo account: `customer@volt.test` / `Shopping123`.\n\n" +
      "Access tokens live 15 minutes. After **Authorize**, paste an `accessToken` from `/auth/login`. Refresh tokens rotate in Redis and are also stored as an httpOnly cookie. Guest carts use the httpOnly `cart_token` cookie.",
  },
  servers: [
    { url: "/", description: "This host (API :3000 or storefront proxy :8088)" },
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Catalog" },
    { name: "Cart" },
    { name: "Checkout" },
    { name: "Orders" },
    { name: "Addresses" },
    { name: "Files" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token from login, MFA complete, or refresh.",
      },
    },
    schemas: {
      Error: error,
      TokenPair: tokenPair,
      User: publicUser,
      Product: product,
      Cart: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          guest: { type: "boolean" },
          itemCount: { type: "integer" },
          subtotal: { type: "number" },
          warnings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productId: { type: "string" },
                message: { type: "string" },
              },
            },
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                productId: { type: "string", format: "uuid" },
                name: { type: "string" },
                slug: { type: "string" },
                price: { type: "number" },
                thumbnail: { type: "string", nullable: true },
                thumbnailAlt: { type: "string" },
                quantity: { type: "integer" },
                stockQuantity: { type: "integer" },
                lineTotal: { type: "number" },
              },
            },
          },
        },
      },
      AddressInput: {
        type: "object",
        required: ["recipientName", "line1", "city", "postal", "country"],
        properties: {
          recipientName: { type: "string" },
          line1: { type: "string" },
          line2: { type: "string" },
          city: { type: "string" },
          region: { type: "string" },
          postal: { type: "string" },
          country: { type: "string", example: "FI" },
          phone: { type: "string" },
          label: { type: "string" },
          isDefault: { type: "boolean" },
        },
      },
      Address: {
        allOf: [
          { $ref: "#/components/schemas/AddressInput" },
          {
            type: "object",
            properties: { id: { type: "string", format: "uuid" } },
          },
        ],
      },
    },
    responses: {
      ValidationError: {
        description: "Invalid input",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Unauthorized: {
        description: "Missing or invalid credentials",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
  paths: {
    "/api/v1/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness and dependency checks",
        responses: {
          "200": {
            description: "Postgres and Redis reachable",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    service: { type: "string" },
                    postgres: { type: "boolean" },
                    redis: { type: "boolean" },
                    rabbitmq: { type: "string", example: "inline" },
                  },
                },
              },
            },
          },
          "503": { description: "A dependency is down" },
        },
      },
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register with email, password, and CAPTCHA",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "captchaToken"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: {
                    type: "string",
                    minLength: 8,
                    description: "At least 8 characters, one upper, one lower, one digit.",
                  },
                  displayName: { type: "string", maxLength: 80 },
                  captchaToken: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Account created; verification email sent (Mailpit)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    userId: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/v1/auth/verify-email": {
      post: {
        tags: ["Auth"],
        summary: "Confirm email with the token from Mailpit",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: { token: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Email verified",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Sign in; may return tokens or an MFA challenge",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email", example: "customer@volt.test" },
                  password: { type: "string", example: "Shopping123" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Session issued, or MFA required",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/TokenPair" },
                    {
                      type: "object",
                      required: ["mfaRequired", "mfaToken", "mfaExpiresInSec"],
                      properties: {
                        mfaRequired: { type: "boolean", enum: [true] },
                        mfaToken: { type: "string" },
                        mfaExpiresInSec: { type: "integer", example: 300 },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/auth/mfa/complete": {
      post: {
        tags: ["Auth"],
        summary: "Finish login with a TOTP or backup code",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["mfaToken"],
                properties: {
                  mfaToken: { type: "string" },
                  totpCode: { type: "string", pattern: "^\\d{6}$" },
                  backupCode: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Session issued",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/TokenPair" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate refresh token and mint a new access token",
        description:
          "Body `refreshToken` is optional if the httpOnly cookie is present. Replaying an already-rotated token revokes the session family.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { refreshToken: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "New pair issued; previous refresh is invalid",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/TokenPair" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke this access token and refresh family",
        security: [{ bearerAuth: [] }, {}],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { refreshToken: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Session revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/logout-all": {
      post: {
        tags: ["Auth"],
        summary: "Revoke every session for the current user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "All sessions revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Profile",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/User" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Send a reset link (always the same response)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: { email: { type: "string", format: "email" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Generic success so emails cannot be enumerated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Set a new password from a Mailpit reset token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token", "password"],
                properties: {
                  token: { type: "string" },
                  password: { type: "string", minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Password updated; all sessions revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/v1/auth/totp/setup": {
      post: {
        tags: ["Auth"],
        summary: "Start optional 2FA (QR + otpauth URI)",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Scan the QR, then confirm with a 6-digit code",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    otpauth: { type: "string" },
                    qrDataUrl: { type: "string" },
                    secret: { type: "string" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/auth/totp/confirm": {
      post: {
        tags: ["Auth"],
        summary: "Confirm 2FA and receive backup codes",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code"],
                properties: { code: { type: "string", pattern: "^\\d{6}$" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "2FA is on",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    backupCodes: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/v1/auth/totp/disable": {
      post: {
        tags: ["Auth"],
        summary: "Turn off 2FA with a current authenticator code",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code"],
                properties: { code: { type: "string", pattern: "^\\d{6}$" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "2FA is off",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/auth/google": {
      get: {
        tags: ["Auth"],
        summary: "Redirect to Google OAuth",
        responses: {
          "302": { description: "Redirect to accounts.google.com" },
          "503": { description: "GOOGLE_CLIENT_ID / SECRET are not set" },
        },
      },
    },
    "/api/v1/auth/google/status": {
      get: {
        tags: ["Auth"],
        summary: "Whether Google sign-in is configured",
        responses: {
          "200": {
            description: "Configuration flag used by the storefront button",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { configured: { type: "boolean" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/google/callback": {
      get: {
        tags: ["Auth"],
        summary: "Google OAuth callback (browser redirect, not for Try it out)",
        parameters: [
          { name: "code", in: "query", schema: { type: "string" } },
          { name: "state", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "302": { description: "Redirects to the storefront /oauth/callback" },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/v1/categories": {
      get: {
        tags: ["Catalog"],
        summary: "List categories",
        responses: {
          "200": {
            description: "Categories with product counts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          name: { type: "string" },
                          slug: { type: "string" },
                          parentId: { type: "string", format: "uuid", nullable: true },
                          _count: {
                            type: "object",
                            properties: { products: { type: "integer" } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/brands": {
      get: {
        tags: ["Catalog"],
        summary: "List brands",
        responses: {
          "200": {
            description: "Brands with product counts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          name: { type: "string" },
                          slug: { type: "string" },
                          _count: {
                            type: "object",
                            properties: { products: { type: "integer" } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/products": {
      get: {
        tags: ["Catalog"],
        summary: "Faceted product listing",
        parameters: [
          { name: "q", in: "query", schema: { type: "string", maxLength: 200 } },
          { name: "category", in: "query", schema: { type: "string" }, example: "audio" },
          { name: "brand", in: "query", schema: { type: "string" } },
          { name: "minPrice", in: "query", schema: { type: "number", minimum: 0 } },
          { name: "maxPrice", in: "query", schema: { type: "number", minimum: 0 } },
          { name: "minRating", in: "query", schema: { type: "number", minimum: 0, maximum: 5 } },
          {
            name: "sort",
            in: "query",
            schema: { type: "string", enum: ["relevance", "price_asc", "price_desc", "rating"] },
          },
          { name: "featured", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 48, default: 12 },
          },
        ],
        responses: {
          "200": {
            description: "Page of products plus facet counts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Product" },
                    },
                    total: { type: "integer" },
                    page: { type: "integer" },
                    pageSize: { type: "integer" },
                    sort: { type: "string" },
                    facets: {
                      type: "object",
                      properties: {
                        brands: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              slug: { type: "string" },
                              name: { type: "string" },
                              count: { type: "integer" },
                            },
                          },
                        },
                        categories: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              slug: { type: "string" },
                              name: { type: "string" },
                              count: { type: "integer" },
                            },
                          },
                        },
                        price: {
                          type: "object",
                          properties: {
                            min: { type: "number" },
                            max: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/v1/products/{idOrSlug}": {
      get: {
        tags: ["Catalog"],
        summary: "Product by id or slug",
        parameters: [
          {
            name: "idOrSlug",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "volt-over-ear-headphones",
          },
        ],
        responses: {
          "200": {
            description: "Product detail",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Product" } },
            },
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Error" } },
            },
          },
        },
      },
    },
    "/api/v1/search/suggest": {
      get: {
        tags: ["Catalog"],
        summary: "Typeahead suggestions",
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 80 },
            example: "head",
          },
        ],
        responses: {
          "200": {
            description: "Matching products and categories",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    products: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" },
                          slug: { type: "string" },
                          href: { type: "string" },
                        },
                      },
                    },
                    categories: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          slug: { type: "string" },
                          href: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/files/{name}": {
      get: {
        tags: ["Files"],
        summary: "Serve a stored product image",
        parameters: [
          {
            name: "name",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^[a-zA-Z0-9._-]+$" },
          },
        ],
        responses: {
          "200": { description: "Image bytes" },
          "400": { $ref: "#/components/responses/ValidationError" },
          "404": { description: "File not found" },
        },
      },
    },
    "/api/v1/cart": {
      get: {
        tags: ["Cart"],
        summary: "Current cart (guest cookie or signed-in user)",
        security: [{ bearerAuth: [] }, {}],
        responses: {
          "200": {
            description: "Cart with line items, thumbnails, and live totals",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Cart" } } },
          },
        },
      },
      delete: {
        tags: ["Cart"],
        summary: "Remove every line from the cart",
        security: [{ bearerAuth: [] }, {}],
        responses: {
          "200": {
            description: "Empty cart",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Cart" } } },
          },
        },
      },
    },
    "/api/v1/cart/related": {
      get: {
        tags: ["Cart"],
        summary: "Related products for the current cart",
        security: [{ bearerAuth: [] }, {}],
        responses: {
          "200": {
            description: "In-stock products from the same categories or brands",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Product" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/cart/items": {
      post: {
        tags: ["Cart"],
        summary: "Add a product (clamped to stock)",
        security: [{ bearerAuth: [] }, {}],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["productId", "quantity"],
                properties: {
                  productId: { type: "string", format: "uuid" },
                  quantity: { type: "integer", minimum: 1, maximum: 99 },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Item added",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Cart" } } },
          },
          "409": {
            description: "Out of stock or quantity exceeds availability",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/v1/cart/items/{itemId}": {
      patch: {
        tags: ["Cart"],
        summary: "Update quantity (0 removes the line)",
        security: [{ bearerAuth: [] }, {}],
        parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["quantity"],
                properties: { quantity: { type: "integer", minimum: 0, maximum: 99 } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated cart",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Cart" } } },
          },
          "409": {
            description: "Quantity exceeds stock",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      delete: {
        tags: ["Cart"],
        summary: "Remove one line",
        security: [{ bearerAuth: [] }, {}],
        parameters: [{ name: "itemId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": {
            description: "Updated cart",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Cart" } } },
          },
        },
      },
    },
    "/api/v1/addresses": {
      get: {
        tags: ["Addresses"],
        summary: "Saved addresses for the signed-in user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Decrypted address book",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Address" } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Addresses"],
        summary: "Save an address (encrypted at rest)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AddressInput" } } },
        },
        responses: {
          "201": {
            description: "Saved",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Address" } } },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/v1/checkout/countries": {
      get: {
        tags: ["Checkout"],
        summary: "Countries accepted for shipping",
        responses: {
          "200": {
            description: "ISO country list used by address validation",
          },
        },
      },
    },
    "/api/v1/checkout/prefill": {
      get: {
        tags: ["Checkout"],
        summary: "Prefill checkout from the signed-in profile",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Email, name, default address" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/checkout/quote": {
      post: {
        tags: ["Checkout"],
        summary: "Live totals for the current cart and shipping method",
        security: [{ bearerAuth: [] }, {}],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  shippingMethod: { type: "string", enum: ["standard", "express"] },
                  address: { $ref: "#/components/schemas/AddressInput" },
                  addressId: { type: "string", format: "uuid" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Subtotal, shipping, tax, total" },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/v1/checkout/validate": {
      post: {
        tags: ["Checkout"],
        summary: "Validate identity, address, and cart before payment",
        security: [{ bearerAuth: [] }, {}],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "displayName", "phone", "shippingMethod"],
                properties: {
                  email: { type: "string", format: "email" },
                  displayName: { type: "string" },
                  phone: { type: "string" },
                  shippingMethod: { type: "string", enum: ["standard", "express"] },
                  address: { $ref: "#/components/schemas/AddressInput" },
                  addressId: { type: "string", format: "uuid" },
                  saveAddress: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Checkout payload is valid" },
          "400": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/v1/checkout/config": {
      get: {
        tags: ["Checkout"],
        summary: "Stripe publishable key for Payment Element",
        responses: {
          "200": { description: "configured flag and pk_test key" },
        },
      },
    },
    "/api/v1/checkout/place": {
      post: {
        tags: ["Checkout"],
        summary: "Reserve stock, create a PaymentIntent, return client secret",
        security: [{ bearerAuth: [] }, {}],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AddressInput" },
            },
          },
        },
        responses: {
          "201": { description: "clientSecret, order, and one-time orderAccessToken" },
          "400": { $ref: "#/components/responses/ValidationError" },
          "409": { description: "Out of stock" },
          "503": { description: "Stripe keys missing" },
          "504": { description: "Simulated gateway timeout (non-production)" },
        },
      },
    },
    "/api/v1/checkout/orders/{id}": {
      get: {
        tags: ["Checkout"],
        summary: "Order confirmation (owner or X-Order-Token)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Order, payment status, timeline" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/checkout/orders/{id}/sync": {
      post: {
        tags: ["Checkout"],
        summary: "Pull PaymentIntent status from Stripe (webhook fallback)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Updated order" },
        },
      },
    },
    "/api/v1/webhooks/stripe": {
      post: {
        tags: ["Checkout"],
        summary: "Stripe webhook (raw body, Stripe-Signature)",
        responses: {
          "200": { description: "received" },
          "400": { description: "Invalid signature" },
        },
      },
    },
    "/api/v1/orders": {
      get: {
        tags: ["Orders"],
        summary: "List the signed-in user's orders",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "PENDING_PAYMENT",
                "PAYMENT_FAILED",
                "PAID",
                "PROCESSING",
                "SHIPPED",
                "DELIVERED",
                "CANCELLED",
                "REFUNDED",
              ],
            },
          },
          { name: "from", in: "query", schema: { type: "string", example: "2026-01-01" } },
          { name: "to", in: "query", schema: { type: "string", example: "2026-12-31" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": { description: "Filtered order list" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/orders/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Order detail (owner or X-Order-Token)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Full order, shipping snapshot, timeline, and canRetry if a later paid order replaced a failed attempt" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/v1/orders/{id}/cancel": {
      post: {
        tags: ["Orders"],
        summary: "Cancel an unprocessed order and restore stock",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Cancelled" },
          "409": { description: "Order is not pending payment" },
        },
      },
    },
    "/api/v1/orders/{id}/refund": {
      post: {
        tags: ["Orders"],
        summary: "Refund a paid order via Stripe sandbox and restore stock",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Refunded" },
          "409": { description: "Order is not paid" },
        },
      },
    },
  },
};
