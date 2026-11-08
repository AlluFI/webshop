import { ResetForm } from "@/components/auth-pages";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("auth.resetTitle")} — Volt & Co`, t("auth.newPassword"));
}

export default function ResetPage() {
  return <ResetForm />;
}
