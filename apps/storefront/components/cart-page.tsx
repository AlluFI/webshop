"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FREE_STANDARD_THRESHOLD } from "@volt/shared";
import { api, userErrorMessage } from "@/lib/api";
import { money, type Product } from "@/lib/product";
import { useAuth } from "./auth";
import { useCart } from "./cart";
import { ProductCard } from "./product-card";
import { CustomerShopGate } from "./shop-gate";

function CartInner() {
  const { cart, ready, error, refresh, updateItem, removeItem } = useCart();
  const { accessToken } = useAuth();
  const [related, setRelated] = useState<Product[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void api("/checkout/abandon", { method: "POST", token: accessToken })
      .catch(() => undefined)
      .then(() => refresh())
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, accessToken]);

  useEffect(() => {
    if (!ready || !hydrated) return;
    if (cart.items.length === 0) {
      setRelated([]);
      return;
    }
    void api<{ items: Product[] }>("/cart/related")
      .then((result) => setRelated(result.items))
      .catch(() => setRelated([]));
  }, [ready, hydrated, cart.items]);

  if (!ready || !hydrated) return <p>Loading cart…</p>;

  async function onQuantity(itemId: string, quantity: number) {
    try {
      await updateItem(itemId, quantity);
      setActionError("");
    } catch (err) {
      setActionError(userErrorMessage(err, "Could not update quantity"));
    }
  }

  async function onRemove(itemId: string) {
    try {
      await removeItem(itemId);
      setActionError("");
    } catch (err) {
      setActionError(userErrorMessage(err, "Could not remove this item"));
    }
  }

  return (
    <section>
      <p className="kicker">Your bag</p>
      <h1>Cart</h1>
      {error && <p className="banner error">{error}</p>}
      {actionError && <p className="banner error">{actionError}</p>}
      {cart.warnings.map((warning) => (
        <p key={warning.productId} className="banner error">
          {warning.message}
        </p>
      ))}
      {cart.items.length === 0 ? (
        <p>
          Your cart is empty. <Link href="/catalog">Browse the catalog</Link>
        </p>
      ) : (
        <div className="checkout-grid">
          <div className="panel cart-list">
            {cart.items.map((item) => (
              <article key={item.id} className="cart-row">
                {item.thumbnail ? <img src={item.thumbnail} alt={item.thumbnailAlt} /> : <div />}
                <div>
                  <Link href={`/products/${item.slug}`}>
                    <strong>{item.name}</strong>
                  </Link>
                  <p className="muted">{money(item.price)} each</p>
                  <label>
                    Qty{" "}
                    <input
                      type="number"
                      min={1}
                      max={item.stockQuantity}
                      value={item.quantity}
                      onChange={(event) => void onQuantity(item.id, Number(event.target.value))}
                    />
                  </label>
                  <button className="link" type="button" onClick={() => void onRemove(item.id)}>
                    Remove
                  </button>
                </div>
                <p className="price">{money(item.lineTotal)}</p>
              </article>
            ))}
          </div>
          <aside className="panel">
            <h2>Summary</h2>
            <p>
              {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
            </p>
            <p className="price" style={{ fontSize: "1.3rem" }}>
              {money(cart.subtotal)}
            </p>
            <p className="muted">
              Shipping is calculated at checkout. Free standard over {money(FREE_STANDARD_THRESHOLD)}.
            </p>
            {cart.guest && (
              <p className="muted">
                Sign in to keep this cart across devices. Guest selections are saved on this browser.
              </p>
            )}
            <div className="actions">
              <Link className="button" href="/checkout">
                Checkout
              </Link>
              <Link className="ghost" href="/catalog">
                Continue shopping
              </Link>
            </div>
          </aside>
        </div>
      )}
      {related.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <p className="kicker">You might also like</p>
          <h2>Related products</h2>
          <div className="grid">
            {related.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function CartPage() {
  return (
    <CustomerShopGate>
      <CartInner />
    </CustomerShopGate>
  );
}
