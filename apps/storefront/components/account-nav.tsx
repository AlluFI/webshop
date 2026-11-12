"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isStaffRole } from "@volt/shared";
import { useAuth } from "./auth";
import { useI18n } from "./i18n";
import { useShopLists } from "./shop-lists";

export function AccountNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { user } = useAuth();
  const { wishlistIds } = useShopLists();
  const staff = Boolean(user && isStaffRole(user.role));
  const wishlistLabel = wishlistIds.length
    ? `${t("nav.wishlist")} (${wishlistIds.length})`
    : t("nav.wishlist");
  const links = [
    { href: "/account", label: t("nav.profile"), current: pathname === "/account" || pathname.startsWith("/account/") },
    { href: "/wishlist", label: wishlistLabel, current: pathname === "/wishlist" || pathname.startsWith("/wishlist/") },
    ...(!staff
      ? [
          { href: "/orders", label: t("nav.orders"), current: pathname === "/orders" || pathname.startsWith("/orders/") },
          { href: "/reviews", label: t("nav.reviews"), current: pathname === "/reviews" || pathname.startsWith("/reviews/") },
        ]
      : []),
  ];

  return (
    <nav className="account-tabs" aria-label={t("orders.account")}>
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={link.current ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
