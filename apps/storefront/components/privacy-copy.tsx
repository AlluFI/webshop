"use client";

import { useI18n } from "./i18n";

export function PrivacyCopy() {
  const { t } = useI18n();
  return (
    <article className="prose-page">
      <p className="kicker">{t("privacy.kicker")}</p>
      <h1>{t("privacy.title")}</h1>
      <p>{t("privacy.p1")}</p>
      <p>{t("privacy.p2")}</p>
      <p>{t("privacy.p3")}</p>
      <p>{t("privacy.p4")}</p>
    </article>
  );
}
