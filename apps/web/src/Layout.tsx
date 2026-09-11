import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { useCart } from "./cart";

type Suggest = {
  products: { name: string; slug: string; href: string }[];
  categories: { name: string; slug: string; href: string }[];
};

export function Layout() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const box = useRef<HTMLFormElement>(null);
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
            <NavLink to="/cart">Cart{cart.itemCount > 0 ? ` (${cart.itemCount})` : ""}</NavLink>
            {user ? (
              <>
                <NavLink to="/orders">Orders</NavLink>
                <NavLink to="/account">{user.displayName || user.email}</NavLink>
                <button className="link" type="button" onClick={() => void logout()}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login">Sign in</NavLink>
                <NavLink to="/register">Create account</NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="page">
        <Outlet />
      </main>
      <footer className="footer">Volt &amp; Co — electronics, chosen with care.</footer>
    </>
  );
}
