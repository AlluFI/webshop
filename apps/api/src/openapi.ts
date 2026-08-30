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
          url: { type: "string", example: "/api/v1/files/headphones.svg" },
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
      "Part 1 storefront API: accounts, JWT sessions, optional TOTP, Google OAuth, and a faceted electronics catalog.\n\n" +
      "Demo account: `customer@volt.test` / `Shopping123`.\n\n" +
      "Access tokens live 15 minutes. After **Authorize**, paste an `accessToken` from `/auth/login`. Refresh tokens rotate in Redis and are also stored as an httpOnly cookie.",
  },
  servers: [
    { url: "/", description: "This host (API :3000 or storefront proxy :8088)" },
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Catalog" },
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
  },
};
