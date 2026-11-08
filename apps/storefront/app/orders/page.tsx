import { OrdersPage } from "@/components/orders-page";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("orders.title")} — Volt & Co`, t("orders.guestLead"));
}

export default function OrdersRoute() {
  return <OrdersPage />;
}
