import { AdminPage } from "@/components/admin-page";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Admin — Volt & Co",
  "Staff tools for catalog, wholesalers, orders, sales, users, reviews, shipping, and the change log at Volt & Co.",
);

export default function AdminRoute() {
  return <AdminPage />;
}
