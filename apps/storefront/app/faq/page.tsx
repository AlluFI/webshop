import Link from "next/link";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("faq.title")} — Volt & Co`, t("faq.shipA"));
}

export default async function FaqPage() {
  const t = await getTranslator();
  return (
    <article className="prose-page">
      <h1>{t("faq.title")}</h1>
      <h2>{t("faq.shipQ")}</h2>
      <p>{t("faq.shipA")}</p>
      <h2>{t("faq.lookupQ")}</h2>
      <p>
        {t("faq.lookupA")}{" "}
        <Link href="/orders/lookup">{t("footer.lookup")}</Link>
      </p>
      <h2>{t("faq.returnQ")}</h2>
      <p>{t("faq.returnA")}</p>
      <h2>{t("faq.cardQ")}</h2>
      <p>{t("faq.cardA")}</p>
    </article>
  );
}
