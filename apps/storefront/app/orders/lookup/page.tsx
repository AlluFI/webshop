import { GuestOrderLookup } from "@/components/guest-order-lookup";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("lookup.title")} — Volt & Co`, t("lookup.lead"));
}

export default function GuestLookupRoute() {
  return <GuestOrderLookup />;
}
