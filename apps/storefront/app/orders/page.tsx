import { OrdersPage } from "@/components/orders-page";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Orders — Volt & Co",
  "View your Volt & Co order history, filter by status and date, and open a confirmation with delivery estimates.",
);

export default function OrdersRoute() {
  return <OrdersPage />;
}
