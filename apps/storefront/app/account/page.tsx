import { AccountPage } from "@/components/account-page";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("account.profile")} — Volt & Co`, t("account.addressesHint"));
}

export default function AccountRoute() {
  return <AccountPage />;
}
