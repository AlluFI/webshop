import { PageMeta } from "../seo";

export function FaqPage() {
  return (
    <article className="prose-page">
      <PageMeta
        title="FAQ — Volt & Co"
        description="Shipping, returns, 2FA, and how Volt & Co handles payments without storing card numbers."
      />
      <h1>FAQ</h1>
      <h2>How fast do you ship?</h2>
      <p>Standard is 3–5 business days (free over €150). Express is 1–2 days.</p>
      <h2>Can I return a paid order?</h2>
      <p>
        Yes — while the order is still <strong>Paid</strong>, open it, choose a reason, and request a
        sandbox refund. Stock is restored. After staff moves it to processing or shipped, only support
        can refund.
      </p>
      <h2>Why do I need 2FA for admin?</h2>
      <p>Staff roles can change prices, refunds, and other people’s roles. Authenticator apps are mandatory.</p>
      <h2>Do you store card numbers?</h2>
      <p>No. Checkout uses Stripe Payment Element. We store PaymentIntent ids, never PAN or CVC.</p>
    </article>
  );
}
