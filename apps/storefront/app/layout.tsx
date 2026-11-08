import type { ReactNode } from "react";
import { CookieBanner } from "@/components/cookie-banner";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VoltieChat } from "@/components/voltie-chat";
import { getRequestLocale } from "@/lib/i18n/server";
import { fitMetaDescription, fitPageTitle } from "@/lib/seo";
import "./globals.css";

export const metadata = {
  title: fitPageTitle("Volt & Co — Electronics"),
  description: fitMetaDescription(
    "Shop headphones, laptops, phones, and home tech at Volt & Co — metric and imperial specs, live stock, purchased-only reviews, and Stripe sandbox checkout today.",
  ),
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Source+Sans+3:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers locale={locale}>
          <SiteHeader />
          <main id="main" className="page">
            {children}
          </main>
          <SiteFooter />
          <VoltieChat />
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
