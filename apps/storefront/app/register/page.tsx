import { RegisterForm } from "@/components/auth-pages";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("auth.registerTitle")} — Volt & Co`, t("auth.registerTitle"));
}

export default function RegisterPage() {
  return <RegisterForm />;
}
