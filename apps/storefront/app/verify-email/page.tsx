import { VerifyForm } from "@/components/auth-pages";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("auth.verifyTitle")} — Volt & Co`, t("auth.verified"));
}

export default function VerifyPage() {
  return <VerifyForm />;
}
