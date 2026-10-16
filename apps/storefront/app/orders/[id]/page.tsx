import { OrderDetail } from "@/components/order-detail";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Order confirmation — Volt & Co",
  "Your Volt & Co order summary, reference number, estimated delivery, and shipping details after checkout.",
);

export default async function OrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetail id={id} />;
}
