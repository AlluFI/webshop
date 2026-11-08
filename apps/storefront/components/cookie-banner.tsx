"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { COOKIE_CONSENT_COOKIE } from "@volt/shared";
import { useI18n } from "./i18n";

export function CookieBanner() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_CONSENT_COOKIE}=([^;]+)`));
    setVisible(!match);
  }, []);

  if (!visible) return null;

  function accept() {
    document.cookie = `${COOKIE_CONSENT_COOKIE}=necessary; Path=/; Max-Age=31536000; SameSite=Lax`;
    setVisible(false);
  }

  return (
    <div className="cookie-banner" role="dialog" aria-label={t("cookie.message")}>
      <p>{t("cookie.message")}</p>
      <div className="actions">
        <Link className="ghost" href="/privacy">
          {t("cookie.privacy")}
        </Link>
        <button className="primary" type="button" onClick={accept}>
          {t("cookie.accept")}
        </button>
      </div>
    </div>
  );
}
