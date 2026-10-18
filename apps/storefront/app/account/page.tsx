import { AccountPage } from "@/components/account-page";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Profile — Volt & Co",
  "Manage your Volt & Co display name, two-factor authentication, and saved shipping addresses.",
);

export default function AccountRoute() {
  return <AccountPage />;
}
