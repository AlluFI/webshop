import { CartPage } from "@/components/cart-page";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("cart.title")} — Volt & Co`, t("cart.shippingHint", { amount: "€150" }));
}

export default function CartRoute() {
  return <CartPage />;
}
