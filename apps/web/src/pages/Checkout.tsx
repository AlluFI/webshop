import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  CHECKOUT_COUNTRIES,
  EXPRESS_SHIPPING,
  FREE_STANDARD_THRESHOLD,
  STANDARD_SHIPPING,
  checkoutValidateSchema,
  type AddressInput,
} from "@volt/shared";
import { api, ApiError, userErrorMessage, storeOrderToken } from "../api";
import { useAuth } from "../auth";
import { useCart } from "../cart";
import { money } from "../product";
import { CheckoutPay } from "./CheckoutPay";
import { PageMeta } from "../seo";

type SavedAddress = AddressInput & { id: string; label?: string | null; isDefault?: boolean };

type Quote = {
  items: { id: string; name: string; quantity: number; lineTotal: number; slug: string }[];
  subtotal: number;
  shippingCost: number;
  shippingLabel: string;
  tax: number;
  total: number;
};

const emptyAddress: AddressInput = {
  recipientName: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal: "",
  country: "FI",
  phone: "",
};

export function CheckoutPage() {
  const { cart, ready, refresh } = useCart();
  const { user, accessToken } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<AddressInput>(emptyAddress);
  const [addressId, setAddressId] = useState("");
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [saveAddress, setSaveAddress] = useState(true);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<AddressInput>(emptyAddress);
  const [shippingMethod, setShippingMethod] = useState<"standard" | "express">("standard");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteWarning, setQuoteWarning] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<{
    clientSecret: string;
    publishableKey: string;
    orderId: string;
    orderToken: string;
    total: number;
    items: Quote["items"];
    subtotal: number;
    shippingCost: number;
    tax: number;
  } | null>(null);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void api<{ configured: boolean }>("/checkout/config")
      .then((result) => setStripeReady(result.configured))
      .catch(() => setStripeReady(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email);
    setDisplayName(user.displayName || "");
    if (!accessToken) return;
    void api<{
      email: string;
      displayName: string;
      phone: string;
      addresses: SavedAddress[];
      defaultAddress: SavedAddress | null;
    }>("/checkout/prefill", { token: accessToken })
      .then((result) => {
        setEmail(result.email);
        setDisplayName(result.displayName || user.displayName || "");
        setPhone(result.phone || "");
        setSaved(result.addresses);
        if (result.defaultAddress) {
          setAddressId(result.defaultAddress.id);
          setAddress(result.defaultAddress);
        }
      })
      .catch(() => undefined);
  }, [user, accessToken]);

  const payload = useMemo(
    () => ({
      email,
      displayName,
      phone,
      shippingMethod,
      saveAddress: Boolean(user) && saveAddress && !addressId,
      addressId: addressId || undefined,
      address: addressId ? undefined : address,
      billingSameAsShipping: billingSame,
      billingAddress: billingSame ? undefined : billing,
    }),
    [email, displayName, phone, shippingMethod, saveAddress, addressId, address, user, billingSame, billing],
  );

  useEffect(() => {
    if (payment) return;
    let cancelled = false;
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [payment, refresh]);

  useEffect(() => {
    if (!ready || payment || cart.items.length === 0) return;
    const handle = window.setTimeout(() => {
      const body: Record<string, unknown> = { shippingMethod };
      if (addressId) body.addressId = addressId;
      void api<Quote>("/checkout/quote", {
        method: "POST",
        token: accessToken,
        body: JSON.stringify(body),
      })
        .then((next) => {
          setQuote(next);
          setQuoteWarning("");
        })
        .catch((err) => {
          setQuote(null);
          setQuoteWarning(userErrorMessage(err, "Could not refresh the order totals."));
        });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [ready, cart.items.length, shippingMethod, addressId, accessToken, payment]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = checkoutValidateSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const last = String(issue.path.at(-1) || issue.path[0] || "form");
        const full = issue.path.join(".") || "form";
        if (!next[last]) next[last] = issue.message;
        if (!next[full]) next[full] = issue.message;
      }
      setFields(next);
      return;
    }
    setFields({});
    setBusy(true);
    try {
      const result = await api<{
        clientSecret: string;
        publishableKey: string;
        orderAccessToken: string;
        order: { id: string; total: number };
      }>("/checkout/place", {
        method: "POST",
        token: accessToken,
        body: JSON.stringify(parsed.data),
      });
      storeOrderToken(result.order.id, result.orderAccessToken);
      setPayment({
        clientSecret: result.clientSecret,
        publishableKey: result.publishableKey,
        orderId: result.order.id,
        orderToken: result.orderAccessToken,
        total: result.order.total,
        items: quote?.items ?? cart.items,
        subtotal: quote?.subtotal ?? cart.subtotal,
        shippingCost: quote?.shippingCost ?? 0,
        tax: quote?.tax ?? 0,
      });
      await refresh().catch(() => undefined);
    } catch (err) {
      setError(userErrorMessage(err, "Could not start payment. Please try again."));
      const next: Record<string, string> = {};
      if (err instanceof ApiError) {
        Object.assign(next, err.fields ?? {});
        for (const [key, value] of Object.entries(err.fields ?? {})) {
          const last = key.split(".").at(-1);
          if (last && !next[last]) next[last] = value;
        }
      }
      setFields(next);
    } finally {
      setBusy(false);
    }
  }

  function applySaved(id: string) {
    setAddressId(id);
    const match = saved.find((item) => item.id === id);
    if (match) {
      setAddress(match);
      if (match.phone) setPhone(match.phone);
    }
  }

  if (!ready || (!payment && !hydrated)) return <p>Loading checkout…</p>;
  if (!payment && cart.items.length === 0) {
    return (
      <section>
        <PageMeta
          title="Checkout — Volt & Co"
          description="Guest or signed-in checkout at Volt & Co: shipping, billing, delivery method, and Stripe sandbox payment."
        />
        <h1>Checkout</h1>
        <p>
          Your cart is empty. <Link to="/catalog">Add something first</Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <PageMeta
        title="Checkout — Volt & Co"
        description="Guest or signed-in checkout at Volt & Co: shipping, billing, delivery method, and Stripe sandbox payment."
      />
      <p className="kicker">Checkout</p>
      <h1>Complete your order</h1>
      {error && <p className="banner error">{error}</p>}
      {quoteWarning && !error && <p className="banner error">{quoteWarning}</p>}
      {fields.network && !error.includes(fields.network) && (
        <p className="banner error">{fields.network}</p>
      )}
      <form className="checkout-grid" onSubmit={(event) => void onSubmit(event)}>
        <div>
          <div className="panel">
            <h2>Contact</h2>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              {fields.email && <p className="error">{fields.email}</p>}
            </label>
            <label className="field">
              <span>Name</span>
              <input
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
              {fields.displayName && <p className="error">{fields.displayName}</p>}
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              {fields.phone && <p className="error">{fields.phone}</p>}
            </label>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Shipping address</h2>
            {saved.length > 0 && (
              <label className="field">
                <span>Saved address</span>
                <select value={addressId} onChange={(event) => applySaved(event.target.value)}>
                  <option value="">New address</option>
                  {saved.map((item) => (
                    <option key={item.id} value={item.id}>
                      {(item.label || item.city) + ` · ${item.postal}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Recipient</span>
              <input
                value={address.recipientName}
                onChange={(event) => {
                  setAddressId("");
                  setAddress({ ...address, recipientName: event.target.value });
                }}
              />
              {fields.recipientName && <p className="error">{fields.recipientName}</p>}
            </label>
            <label className="field">
              <span>Street</span>
              <input
                autoComplete="address-line1"
                value={address.line1}
                onChange={(event) => {
                  setAddressId("");
                  setAddress({ ...address, line1: event.target.value });
                }}
              />
              {fields.line1 && <p className="error">{fields.line1}</p>}
            </label>
            <label className="field">
              <span>Apartment, suite (optional)</span>
              <input
                autoComplete="address-line2"
                value={address.line2 || ""}
                onChange={(event) => {
                  setAddressId("");
                  setAddress({ ...address, line2: event.target.value });
                }}
              />
            </label>
            <div className="dims">
              <label className="field">
                <span>City</span>
                <input
                  autoComplete="address-level2"
                  value={address.city}
                  onChange={(event) => {
                    setAddressId("");
                    setAddress({ ...address, city: event.target.value });
                  }}
                />
                {fields.city && <p className="error">{fields.city}</p>}
              </label>
              <label className="field">
                <span>Postal code</span>
                <input
                  autoComplete="postal-code"
                  value={address.postal}
                  onChange={(event) => {
                    setAddressId("");
                    setAddress({ ...address, postal: event.target.value });
                  }}
                />
              </label>
            </div>
            {fields.postal && <p className="error">{fields.postal}</p>}
            {fields.address && <p className="error">{fields.address}</p>}
            <label className="field">
              <span>Region / state (optional)</span>
              <input
                autoComplete="address-level1"
                value={address.region || ""}
                onChange={(event) => {
                  setAddressId("");
                  setAddress({ ...address, region: event.target.value });
                }}
              />
            </label>
            <label className="field">
              <span>Country</span>
              <select
                value={address.country}
                onChange={(event) => {
                  setAddressId("");
                  setAddress({ ...address, country: event.target.value as AddressInput["country"] });
                }}
              >
                {CHECKOUT_COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
            {user && !addressId && (
              <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={(event) => setSaveAddress(event.target.checked)}
                />
                <span>Save this address to my account</span>
              </label>
            )}
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Billing address</h2>
            <label className="field choice">
              <input type="checkbox" checked={billingSame} onChange={(event) => setBillingSame(event.target.checked)} />
              Same as shipping
            </label>
            {!billingSame && (
              <>
                <label className="field">
                  <span>Recipient</span>
                  <input
                    value={billing.recipientName}
                    onChange={(event) => setBilling({ ...billing, recipientName: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Street</span>
                  <input
                    value={billing.line1}
                    onChange={(event) => setBilling({ ...billing, line1: event.target.value })}
                  />
                </label>
                <div className="dims">
                  <label className="field">
                    <span>City</span>
                    <input
                      value={billing.city}
                      onChange={(event) => setBilling({ ...billing, city: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Postal code</span>
                    <input
                      value={billing.postal}
                      onChange={(event) => setBilling({ ...billing, postal: event.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Country</span>
                  <select
                    value={billing.country}
                    onChange={(event) =>
                      setBilling({ ...billing, country: event.target.value as AddressInput["country"] })
                    }
                  >
                    {CHECKOUT_COUNTRIES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </label>
                {fields.billingAddress && <p className="error">{fields.billingAddress}</p>}
              </>
            )}
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Shipping</h2>
            <label className="field choice">
              <input
                type="radio"
                name="shipping"
                checked={shippingMethod === "standard"}
                onChange={() => setShippingMethod("standard")}
              />
              Standard (3–5 days) —{" "}
              {cart.subtotal >= FREE_STANDARD_THRESHOLD ? "Free" : money(STANDARD_SHIPPING)}
            </label>
            <label className="field choice">
              <input
                type="radio"
                name="shipping"
                checked={shippingMethod === "express"}
                onChange={() => setShippingMethod("express")}
              />
              Express (1–2 days) — {money(EXPRESS_SHIPPING)}
            </label>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Payment</h2>
            {payment ? (
              <CheckoutPay
                clientSecret={payment.clientSecret}
                publishableKey={payment.publishableKey}
                orderId={payment.orderId}
                orderToken={payment.orderToken}
                accessToken={accessToken}
                total={payment.total}
              />
            ) : (
              <>
                {stripeReady === false && (
                  <p className="banner error">
                    Add Stripe test keys to <code>.env</code> (<code>STRIPE_SECRET_KEY</code> and{" "}
                    <code>STRIPE_PUBLISHABLE_KEY</code>) and restart the API.
                  </p>
                )}
                <p className="muted">
                  Card details stay in Stripe Elements. Only PaymentIntent ids are stored, never
                  card numbers. After the address is confirmed, the card is collected by Stripe.
                </p>
                <button className="primary" type="submit" disabled={busy || stripeReady === false}>
                  {busy ? "Reserving stock…" : "Continue to payment"}
                </button>
              </>
            )}
          </div>
        </div>
        <aside className="panel">
          <h2>Order summary</h2>
          <ul className="summary-list">
            {(payment?.items ?? quote?.items ?? cart.items).map((item) => (
              <li key={item.id}>
                <Link to={`/products/${"slug" in item ? item.slug : ""}`}>{item.name}</Link>
                <span>
                  ×{item.quantity} · {money(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
          <p>
            <Link to="/cart">Edit cart</Link>
          </p>
          <p>Subtotal {money(payment?.subtotal ?? quote?.subtotal ?? cart.subtotal)}</p>
          <p>
            Shipping{" "}
            {money(
              payment?.shippingCost ??
                quote?.shippingCost ??
                (shippingMethod === "express"
                  ? EXPRESS_SHIPPING
                  : cart.subtotal >= FREE_STANDARD_THRESHOLD
                    ? 0
                    : STANDARD_SHIPPING),
            )}
          </p>
          <p>Tax {money(payment?.tax ?? quote?.tax ?? 0)}</p>
          <p className="price" style={{ fontSize: "1.3rem" }}>
            Total{" "}
            {money(
              payment?.total ??
                quote?.total ??
                cart.subtotal +
                  (shippingMethod === "express"
                    ? EXPRESS_SHIPPING
                    : cart.subtotal >= FREE_STANDARD_THRESHOLD
                      ? 0
                      : STANDARD_SHIPPING),
            )}
          </p>
        </aside>
      </form>
    </section>
  );
}
