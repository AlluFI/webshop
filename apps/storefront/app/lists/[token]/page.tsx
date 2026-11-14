import { GiftListPage } from "@/components/gift-list-page";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return {
    ...pageMetadata(`${t("gift.title")} — Volt & Co`, t("wishlist.shareLead")),
    robots: { index: false, follow: false },
  };
}

export default async function SharedGiftListRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <GiftListPage token={token} />;
}
