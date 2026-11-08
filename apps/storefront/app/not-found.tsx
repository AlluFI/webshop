import Link from "next/link";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("notFound.kicker")} — Volt & Co`, t("notFound.body"));
}

export default async function NotFound() {
  const t = await getTranslator();
  return (
    <section>
      <p className="kicker">{t("notFound.kicker")}</p>
      <h1>{t("notFound.title")}</h1>
      <p className="muted">{t("notFound.body")}</p>
      <div className="actions">
        <Link className="button" href="/">
          {t("common.home")}
        </Link>
        <Link className="ghost" href="/catalog">
          {t("nav.catalog")}
        </Link>
        <Link className="ghost" href="/contact">
          {t("notFound.contact")}
        </Link>
      </div>
    </section>
  );
}
