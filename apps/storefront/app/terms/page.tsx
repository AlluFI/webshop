import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("terms.title")} — Volt & Co`, t("terms.tosBody"));
}

export default async function TermsPage() {
  const t = await getTranslator();
  return (
    <article className="prose-page">
      <p className="kicker">{t("terms.kicker")}</p>
      <h1>{t("terms.title")}</h1>
      <h2>{t("terms.tos")}</h2>
      <p>{t("terms.tosBody")}</p>
      <h2>{t("terms.privacy")}</h2>
      <p>{t("terms.privacyBody")}</p>
      <h2>{t("terms.data")}</h2>
      <p>{t("terms.dataBody")}</p>
    </article>
  );
}
