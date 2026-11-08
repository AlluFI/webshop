import { LoginForm } from "@/components/auth-pages";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("auth.signInTitle")} — Volt & Co`, t("auth.signInTitle"));
}

export default function LoginPage() {
  return <LoginForm />;
}
