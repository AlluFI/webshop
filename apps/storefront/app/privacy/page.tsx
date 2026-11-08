import { pageMetadata } from "@/lib/seo";
import { PrivacyCopy } from "@/components/privacy-copy";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("privacy.title")} — Volt & Co`, t("privacy.p1"));
}

export default function PrivacyPage() {
  return <PrivacyCopy />;
}
