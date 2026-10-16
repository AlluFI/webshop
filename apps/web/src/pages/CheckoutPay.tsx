import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { STRIPE_TEST_CARDS } from "@volt/shared";
import { api, ApiError, userErrorMessage } from "../api";
import { money } from "../product";
import { useCart } from "../cart";

/** Incomplete fields stay on this form. A declined card must /sync so the worker can email. */
function isPaymentDecline(error: {
  type?: string;
  payment_intent?: { status?: string } | null;
}) {
  if (error.type === "validation_error" || error.type === "api_connection_error") return false;
  if (error.type === "card_error") return true;
  const status = error.payment_intent?.status;
  return status === "requires_payment_method" || status === "canceled";
}

const appearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#1f3d34",
    colorBackground: "#fffdf8",
    colorText: "#1b241f",
    colorDanger: "#9b2c2c",
    borderRadius: "10px",
  },
};

type Props = {
  clientSecret: string;
  publishableKey: string;
  orderId: string;
  orderToken: string;
  accessToken: string | null;
  total: number;
};

function PayForm({
  orderId,
  orderToken,
  accessToken,
  total,
}: Omit<Props, "clientSecret" | "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { refresh } = useCart();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onPay() {
    if (!stripe || !elements) return;
    setError("");
    setBusy(true);
    try {
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/orders/${orderId}`,
        },
        redirect: "if_required",
      });
      if (confirmError && !isPaymentDecline(confirmError)) {
        const connection = confirmError.type === "api_connection_error";
        setError(
          connection
            ? "Stripe could not be reached. Check your connection and try again. Nothing was charged."
            : confirmError.message || "The card was declined.",
        );
        return;
      }
      try {
        await api(`/checkout/orders/${orderId}/sync`, {
          method: "POST",
          token: accessToken,
          orderToken,
        });
        await refresh().catch(() => undefined);
      } catch (err) {
        if (!confirmError) {
          setError(
            err instanceof ApiError && err.isNetwork
              ? "Payment may have gone through, but it could not be confirmed. Opening the order…"
              : userErrorMessage(err, "Payment may have succeeded. Opening your order to check."),
          );
        }
      }
      navigate(`/orders/${orderId}`);
    } catch (err) {
      setError(userErrorMessage(err, "Stripe could not be reached. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <p className="banner error">{error}</p>}
      {/* Stripe.js validates number, expiry, and CVC inside this iframe. */}
      <PaymentElement options={{ layout: "tabs" }} />
      <p className="muted" style={{ marginTop: 12 }}>
        Card number, expiry, and CVC are collected by Stripe.js. The raw card is never received by this shop.
      </p>
      <button className="primary" type="button" onClick={() => void onPay()} disabled={!stripe || busy} style={{ marginTop: 12 }}>
        {busy ? "Paying…" : `Pay ${money(total)}`}
      </button>
      <ul className="muted" style={{ marginTop: 16, paddingLeft: 18, fontSize: "0.92rem" }}>
        {STRIPE_TEST_CARDS.map((card) => (
          <li key={card.number}>
            <strong>{card.label}:</strong> {card.number} — {card.note}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CheckoutPay(props: Props) {
  const stripePromise = useMemo(() => loadStripe(props.publishableKey), [props.publishableKey]);
  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret: props.clientSecret, appearance }}
    >
      <PayForm
        orderId={props.orderId}
        orderToken={props.orderToken}
        accessToken={props.accessToken}
        total={props.total}
      />
    </Elements>
  );
}
