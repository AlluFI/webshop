import Link from "next/link";

export function ComingSoon({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section>
      <p className="kicker">Next.js storefront</p>
      <h1>{title}</h1>
      <p className="muted">{body}</p>
      <p>
        The Vite shop on <code>http://localhost:8088</code> still has the full checkout, orders, and
        admin until those islands are ported.
      </p>
      <div className="actions">
        <Link className="button" href="/catalog">
          Catalog
        </Link>
        <Link className="ghost" href="/cart">
          Cart
        </Link>
      </div>
    </section>
  );
}
