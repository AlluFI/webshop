import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Page not found — Volt & Co",
  "That address is not a page in the Volt & Co shop. Try the catalog or home.",
);

export default function NotFound() {
  return (
    <section>
      <p className="kicker">404</p>
      <h1>This aisle does not exist.</h1>
      <p className="muted">The link may be old, or the product was removed from the catalog.</p>
      <div className="actions">
        <Link className="button" href="/">
          Home
        </Link>
        <Link className="ghost" href="/catalog">
          Catalog
        </Link>
        <Link className="ghost" href="/contact">
          Contact
        </Link>
      </div>
    </section>
  );
}
