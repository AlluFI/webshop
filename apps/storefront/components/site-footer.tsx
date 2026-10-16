import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="footer">
      <nav aria-label="Footer">
        <Link href="/about">About</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/catalog">Catalog</Link>
      </nav>
      <p>Volt &amp; Co — electronics, chosen with care.</p>
    </footer>
  );
}
