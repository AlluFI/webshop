import Stripe from "stripe";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";

let client: Stripe | null = null;

export function stripeConfigured() {
  return Boolean(config.stripeSecretKey && config.stripePublishableKey);
}

export function requireStripe(): Stripe {
  if (!stripeConfigured()) {
    throw new HttpError(
      503,
      "Stripe is not configured. Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY (test mode) to .env.",
      { payment: "Payments are not configured in this environment." },
    );
  }
  if (!client) {
    client = new Stripe(config.stripeSecretKey);
  }
  return client;
}

export function setStripeClientForTests(mock: Stripe | null) {
  client = mock;
}

export function stripePublishableKey() {
  return config.stripePublishableKey;
}
