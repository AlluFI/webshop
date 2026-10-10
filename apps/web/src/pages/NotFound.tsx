import { Link } from "react-router-dom";
import { PageMeta } from "../seo";

export function NotFoundPage() {
  return (
    <section>
      <PageMeta
        title="Page not found — Volt & Co"
        description="That address is not a page in the Volt & Co shop. Try the catalog or home."
      />
      <p className="kicker">404</p>
      <h1>This aisle does not exist.</h1>
      <p className="muted">The link may be old, or the product was removed from the catalog.</p>
      <div className="actions">
        <Link className="button" to="/">
          Home
        </Link>
        <Link className="ghost" to="/catalog">
          Catalog
        </Link>
        <Link className="ghost" to="/contact">
          Contact
        </Link>
      </div>
    </section>
  );
}
