"use client";

import Link from "next/link";
import { useI18n } from "./i18n";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <nav aria-label="Footer">
        <Link href="/about">{t("footer.about")}</Link>
        <Link href="/contact">{t("footer.contact")}</Link>
        <Link href="/faq">{t("footer.faq")}</Link>
        <Link href="/terms">{t("footer.terms")}</Link>
        <Link href="/privacy">{t("footer.privacy")}</Link>
        <Link href="/orders/lookup">{t("footer.lookup")}</Link>
        <Link href="/catalog">{t("nav.catalog")}</Link>
      </nav>
      <p>{t("footer.tagline")}</p>
    </footer>
  );
}
