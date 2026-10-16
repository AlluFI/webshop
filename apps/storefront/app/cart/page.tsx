import { CartPage } from "@/components/cart-page";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Cart — Volt & Co",
  "Review items in your Volt & Co cart, update quantities, and continue to checkout. Totals exclude shipping until you choose a method.",
);

export default function CartRoute() {
  return <CartPage />;
}
