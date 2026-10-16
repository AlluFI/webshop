import { AccountPage } from "@/components/account-page";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Account — Volt & Co",
  "Manage your Volt & Co profile, order history, two-factor authentication, and saved shipping addresses.",
);

export default function AccountRoute() {
  return <AccountPage />;
}
