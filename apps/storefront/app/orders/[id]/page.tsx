import { OrderDetail } from "@/components/order-detail";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("order.title")} — Volt & Co`, t("order.mailpit"));
}

export default async function OrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetail id={id} />;
}
