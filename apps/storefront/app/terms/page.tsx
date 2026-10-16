import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Terms — Volt & Co",
  "Terms of service and privacy policy for Volt & Co: what we collect, how we use it, and how you shop.",
);

export default function TermsPage() {
  return (
    <article className="prose-page">
      <p className="kicker">Legal</p>
      <h1>Terms and privacy</h1>
      <h2>Terms of service</h2>
      <p>
        Volt &amp; Co sells electronics for personal use. Prices are in euros. Placing an order is an
        offer to buy; the contract forms when payment succeeds. We can cancel an order if stock is
        wrong or a price is an obvious error. Returns follow the FAQ: unused items within 14 days of
        delivery, with original packaging where practical.
      </p>
      <h2>Privacy policy</h2>
      <p>
        We collect account email, display name, encrypted shipping addresses, order snapshots, and
        (if you enable it) a TOTP secret. Card numbers never reach our servers — Stripe Payment
        Element handles them. Session cookies are httpOnly. Access tokens stay in browser memory.
        Reviews you publish appear on product pages with your display name.
      </p>
      <h2>Data use</h2>
      <p>
        We use this data to fulfill orders, send Mailpit/sandbox receipts, moderate reviews, and
        operate staff tools. We do not sell personal data. Staff access is role-based and audited.
        You can ask support to hide a review or close an account.
      </p>
    </article>
  );
}
