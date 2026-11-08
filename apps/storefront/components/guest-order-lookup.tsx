"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, storeOrderToken, userErrorMessage } from "@/lib/api";
import { useI18n } from "./i18n";

export function GuestOrderLookup() {
  const { t } = useI18n();
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ order: { id: string }; orderAccessToken: string }>("/orders/lookup", {
        method: "POST",
        body: JSON.stringify({ reference, lastName }),
      });
      storeOrderToken(result.order.id, result.orderAccessToken);
      router.push(`/orders/${result.order.id}`);
    } catch (err) {
      setError(userErrorMessage(err, "Order not found"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>{t("lookup.title")}</h1>
      <p>{t("lookup.lead")}</p>
      {error && <p className="banner error">{error}</p>}
      <form className="panel" style={{ maxWidth: 420 }} onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>{t("lookup.reference")}</span>
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="VC-A1B2C3D4"
            autoComplete="off"
            required
          />
        </label>
        <label className="field">
          <span>{t("lookup.lastName")}</span>
          <input
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            autoComplete="family-name"
            required
          />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? t("lookup.busy") : t("lookup.submit")}
        </button>
      </form>
    </section>
  );
}
