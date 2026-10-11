import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { isStaffRole } from "@volt/shared";
import { api } from "./api";
import { useAuth } from "./auth";
import { useCart } from "./cart";
import { money } from "./product";

type Suggest = {
  products: { name: string; slug: string; href: string }[];
  categories: { name: string; slug: string; href: string }[];
};

export function Layout() {
  const { user, logout, ready } = useAuth();
  const { cart } = useCart();
  const staff = Boolean(user && isStaffRole(user.role));
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  const bag = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setSuggest(null);
    navigate(`/catalog?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="header">
        <div className="header-inner">
          <Link className="logo" to="/">
            Volt <span>&amp;</span> Co
          </Link>
          <form className="search" onSubmit={onSearch} ref={box} role="search">
            <label className="skip" htmlFor="q">
              Search products
            </label>
            <input
              id="q"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search headphones, laptops, phones…"
              autoComplete="off"
            />
            {suggest && (suggest.products.length > 0 || suggest.categories.length > 0) && (
              <div className="suggest" role="listbox">
                {suggest.products.map((item) => (
                  <Link key={item.slug} to={item.href} onClick={() => setSuggest(null)}>
                    {item.name}
                  </Link>
                ))}
                {suggest.categories.map((item) => (
                  <Link key={item.slug} to={item.href} onClick={() => setSuggest(null)}>
                    Category: {item.name}
                  </Link>
                ))}
              </div>
            )}
          </form>
          <nav className="nav" aria-label="Account">
            <NavLink to="/catalog">Catalog</NavLink>
            {ready && !staff && (
              <div className="bag-wrap" ref={bag}>
                <button className="link bag-toggle" type="button" onClick={() => setBagOpen((open) => !open)}>
                  Cart{cart.itemCount > 0 ? ` (${cart.itemCount})` : ""}
                </button>
                {bagOpen && (
                  <div className="quick-cart" role="dialog" aria-label="Cart preview">
                    {cart.items.length === 0 ? (
                      <p className="muted">Your bag is empty.</p>
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
                    <p className="price">Subtotal {money(cart.subtotal)}</p>
                    <div className="actions">
                      <Link className="button" to="/cart" onClick={() => setBagOpen(false)}>
                        View cart
                      </Link>
                      {cart.items.length > 0 && (
                        <Link className="ghost" to="/checkout" onClick={() => setBagOpen(false)}>
                          Checkout
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {ready && user ? (
              <>
                {!staff && <NavLink to="/orders">Orders</NavLink>}
                {staff && <NavLink to="/admin">Admin</NavLink>}
                <NavLink to="/account">{user.displayName || user.email}</NavLink>
                <button className="link" type="button" onClick={() => void logout()}>
                  Sign out
                </button>
              </>
            ) : ready ? (
              <>
                <NavLink to="/login">Sign in</NavLink>
                <NavLink to="/register">Create account</NavLink>
              </>
            ) : null}
          </nav>
        </div>
      </header>
      <main id="main" className="page">
        <Outlet />
      </main>
      <footer className="footer">
        <nav aria-label="Footer">
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/faq">FAQ</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/catalog">Catalog</Link>
        </nav>
        <p>Volt &amp; Co — electronics, chosen with care.</p>
      </footer>
    </>
  );
}
