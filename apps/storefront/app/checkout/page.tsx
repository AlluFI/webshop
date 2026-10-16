import { CheckoutPage } from "@/components/checkout-page";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Checkout — Volt & Co",
  "Guest or signed-in checkout at Volt & Co: shipping, billing, delivery method, and Stripe sandbox payment.",
);

export default function CheckoutRoute() {
  return <CheckoutPage />;
}
