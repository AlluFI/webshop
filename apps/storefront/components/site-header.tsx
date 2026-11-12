"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { isStaffRole } from "@volt/shared";
import { api } from "@/lib/api";
import { money } from "@/lib/product";
import { useAuth } from "./auth";
import { useCart } from "./cart";
import { LanguageSwitcher, useI18n } from "./i18n";
import { useShopLists } from "./shop-lists";

type Suggest = {
  products: { name: string; slug: string; href: string }[];
  categories: { name: string; slug: string; href: string }[];
};

function NavItem({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || (href !== "/" && pathname.startsWith(href));
  return (
    <Link href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}

export function SiteHeader() {
  const { t } = useI18n();
  const { wishlistIds, compareIds } = useShopLists();
  const { user, logout, ready } = useAuth();
  const { cart } = useCart();
  const staff = Boolean(user && isStaffRole(user.role));
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  const bag = useRef<HTMLDivElement>(null);
  const account = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const onAccount = pathname === "/account" || pathname.startsWith("/account/");
  const onOrders = pathname === "/orders" || pathname.startsWith("/orders/");
  const onWishlist = pathname === "/wishlist" || pathname.startsWith("/wishlist/");
  const onReviews = pathname === "/reviews" || pathname.startsWith("/reviews/");

  useEffect(() => {
    if (q.trim().length < 2) {
      setSuggest(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void api<Suggest>(`/search/suggest?q=${encodeURIComponent(q.trim())}`)
        .then(setSuggest)
        .catch(() => setSuggest(null));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setSuggest(null);
      if (!bag.current?.contains(event.target as Node)) setBagOpen(false);
      if (!account.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setSuggest(null);
    router.push(`/catalog?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <>
      <a className="skip" href="#main">
        {t("nav.skip")}
      </a>
      <header className="header">
        <div className="header-inner">
          <Link className="logo" href="/">
            Volt <span>&amp;</span> Co
          </Link>
          <form className="search" onSubmit={onSearch} ref={box} role="search">
            <label className="skip" htmlFor="q">
              {t("nav.search")}
            </label>
            <input
              id="q"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={t("nav.searchPlaceholder")}
              autoComplete="off"
            />
            {suggest && (suggest.products.length > 0 || suggest.categories.length > 0) && (
              <div className="suggest" role="listbox">
                {suggest.products.map((item) => (
                  <Link key={item.slug} href={item.href} onClick={() => setSuggest(null)}>
                    {item.name}
                  </Link>
                ))}
                {suggest.categories.map((item) => (
                  <Link key={item.slug} href={item.href} onClick={() => setSuggest(null)}>
                    {t("nav.category", { name: item.name })}
                  </Link>
                ))}
              </div>
            )}
          </form>
          <nav className="nav" aria-label={t("orders.account")}>
            {ready && !staff && (
              <div className="bag-wrap" ref={bag}>
                <button
                  className="link bag-toggle cart-btn"
                  type="button"
                  aria-label={cart.itemCount > 0 ? t("nav.cartCount", { n: cart.itemCount }) : t("nav.cart")}
                  onClick={() => setBagOpen((open) => !open)}
                >
                  <svg className="cart-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 7h15l-1.4 8.2a2 2 0 0 1-2 1.6H9.2a2 2 0 0 1-2-1.6L5.2 4H3"
                    />
                    <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
                    <circle cx="17.5" cy="20" r="1.4" fill="currentColor" />
                  </svg>
                  {cart.itemCount > 0 && <span className="cart-count">{cart.itemCount}</span>}
                </button>
                {bagOpen && (
                  <div className="quick-cart" role="dialog" aria-label={t("nav.cart")}>
                    {cart.items.length === 0 ? (
                      <p className="muted">{t("nav.cartEmpty")}</p>
                    ) : (
                      <ul>
                        {cart.items.slice(0, 4).map((item) => (
                          <li key={item.id}>
                            {item.thumbnail && <img src={item.thumbnail} alt="" />}
                            <span>
                              {item.name}
                              <br />
                              <span className="muted">
                                ×{item.quantity} · {money(item.lineTotal)}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="price">{t("nav.subtotal", { amount: money(cart.subtotal) })}</p>
                    <div className="actions">
                      <Link className="button" href="/cart" onClick={() => setBagOpen(false)}>
                        {t("nav.viewCart")}
                      </Link>
                      {cart.items.length > 0 && (
                        <Link className="ghost" href="/checkout" onClick={() => setBagOpen(false)}>
                          {t("nav.checkout")}
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <NavItem href="/catalog">{t("nav.catalog")}</NavItem>
            {compareIds.length > 0 && (
              <NavItem href="/compare">
                {t("nav.compare")} ({compareIds.length})
              </NavItem>
            )}
            <LanguageSwitcher />
            {ready && user ? (
              <>
                {staff && <NavItem href="/admin">{t("nav.admin")}</NavItem>}
                <div className="account-wrap" ref={account}>
                  <button
                    className="link account-toggle"
                    type="button"
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                    aria-current={onAccount || onOrders || onWishlist || onReviews ? "page" : undefined}
                    onClick={() => setAccountOpen((open) => !open)}
                  >
                    {user.displayName || user.email}
                  </button>
                  {accountOpen && (
                    <div className="account-menu" role="menu" aria-label={t("orders.account")}>
                      <Link
                        href="/account"
                        role="menuitem"
                        aria-current={onAccount ? "page" : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          setAccountOpen(false);
                          router.push("/account");
                        }}
                      >
                        {t("nav.profile")}
                      </Link>
                      <Link
                        href="/wishlist"
                        role="menuitem"
                        aria-current={onWishlist ? "page" : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          setAccountOpen(false);
                          router.push("/wishlist");
                        }}
                      >
                        {t("nav.wishlist")}
                        {wishlistIds.length > 0 ? ` (${wishlistIds.length})` : ""}
                      </Link>
                      {!staff && (
                        <Link
                          href="/orders"
                          role="menuitem"
                          aria-current={onOrders ? "page" : undefined}
                          onClick={(event) => {
                            event.preventDefault();
                            setAccountOpen(false);
                            router.push("/orders");
                          }}
                        >
                          {t("nav.orders")}
                        </Link>
                      )}
                      {!staff && (
                        <Link
                          href="/reviews"
                          role="menuitem"
                          aria-current={onReviews ? "page" : undefined}
                          onClick={(event) => {
                            event.preventDefault();
                            setAccountOpen(false);
                            router.push("/reviews");
                          }}
                        >
                          {t("nav.reviews")}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                <button className="link" type="button" onClick={() => void logout()}>
                  {t("nav.signOut")}
                </button>
              </>
            ) : ready ? (
              <>
                <NavItem href="/login">{t("nav.signIn")}</NavItem>
                <NavItem href="/register">{t("nav.createAccount")}</NavItem>
              </>
            ) : null}
          </nav>
        </div>
      </header>
    </>
  );
}
