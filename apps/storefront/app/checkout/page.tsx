import { CheckoutPage } from "@/components/checkout-page";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("checkout.title")} — Volt & Co`, t("checkout.cardStay"));
}

export default function CheckoutRoute() {
  return <CheckoutPage />;
}
