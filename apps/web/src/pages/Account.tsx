import { useEffect, useState, type FormEvent } from "react";
import { Navigate, Link } from "react-router-dom";
import { CHECKOUT_COUNTRIES, addressSchema, isStaffRole, type AddressInput } from "@volt/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { PageMeta } from "../seo";
import { money } from "../product";

export function AccountPage() {
  const { user, accessToken, ready, reloadUser } = useAuth();
  const [setup, setSetup] = useState<{ qrDataUrl: string; otpauth: string } | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (user) setDisplayName(user.displayName || "");
  }, [user]);

  if (!ready) return <p>Loading…</p>;
  if (!user || !accessToken) return <Navigate to="/login" replace />;

  async function startTotp() {
    setError("");
    setMessage("");
    try {
      const result = await api<{ qrDataUrl: string; otpauth: string }>("/auth/totp/setup", {
        method: "POST",
        token: accessToken,
      });
      setSetup(result);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function confirmTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      const result = await api<{ message: string; backupCodes: string[] }>("/auth/totp/confirm", {
        method: "POST",
        token: accessToken,
        body: JSON.stringify({ code: String(form.get("code") || "") }),
      });
      setBackup(result.backupCodes);
      setMessage(result.message);
      setSetup(null);
      await reloadUser();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function disableTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      const result = await api<{ message: string }>("/auth/totp/disable", {
        method: "POST",
        token: accessToken,
        body: JSON.stringify({ code: String(form.get("code") || "") }),
      });
      setMessage(result.message);
      setBackup([]);
      await reloadUser();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <section className="auth-card" style={{ maxWidth: 560 }}>
      <PageMeta
        title="Account — Volt & Co"
        description="Manage your Volt & Co profile, order history, two-factor authentication, and saved shipping addresses."
      />
      <h1>Your account</h1>
      <p>
        {user.displayName || "Customer"} · {user.email}
      </p>
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          void api("/auth/me", {
            method: "PATCH",
            token: accessToken,
            body: JSON.stringify({ displayName }),
          })
            .then(async () => {
              setMessage("Profile updated.");
              await reloadUser();
            })
            .catch((err) => {
              setError(err instanceof ApiError ? err.message : "Could not update profile");
            });
        }}
      >
        <h2>Profile</h2>
        <label className="field">
          <span>Display name</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        </label>
        <button className="primary" type="submit">
          Save profile
        </button>
      </form>
      <RecentOrders token={accessToken} />
      <p>
        Two-factor authentication:{" "}
        <strong>{user.totpEnabled ? "Active" : "Off"}</strong>
      </p>
      {message && <p className="banner ok">{message}</p>}
      {error && <p className="banner error">{error}</p>}
      {backup.length > 0 && (
        <p>
          Backup codes (save these now): <code>{backup.join(" ")}</code>
        </p>
      )}
      {!user.totpEnabled && !setup && (
        <>
          <p className="muted">
            Enabling is two steps: scan a QR code in Authenticator or Authy, then enter the 6-digit
            code to confirm. The button alone does not turn 2FA on.
          </p>
          <button className="primary" type="button" onClick={() => void startTotp()}>
            Enable two-factor authentication
          </button>
        </>
      )}
      {setup && (
        <>
          <p>Scan this QR code with Google Authenticator or Authy, then enter the current code.</p>
          <img src={setup.qrDataUrl} alt="Two-factor authentication QR code" width={180} height={180} />
          <p className="muted">{setup.otpauth}</p>
          <form onSubmit={(event) => void confirmTotp(event)}>
            <label className="field">
              <span>6-digit code</span>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
            </label>
            <button className="primary" type="submit">
              Confirm 2FA
            </button>
          </form>
        </>
      )}
      {user.totpEnabled && !isStaffRole(user.role) && (
        <form onSubmit={(event) => void disableTotp(event)}>
          <label className="field">
            <span>Disable 2FA with a current authenticator code</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
          </label>
          <button className="ghost" type="submit">
            Turn off 2FA
          </button>
        </form>
      )}
      {user.totpEnabled && isStaffRole(user.role) && (
        <p className="muted">Staff accounts must keep two-factor authentication on.</p>
      )}
      <AddressBook token={accessToken} />
    </section>
  );
}

type SavedAddress = AddressInput & { id: string; label?: string | null; isDefault?: boolean };

function RecentOrders({ token }: { token: string }) {
  const [items, setItems] = useState<
    { id: string; status: string; total: number; summary: string; createdAt: string }[]
  >([]);

  useEffect(() => {
    void api<{ items: typeof items }>("/orders", { token })
      .then((result) => setItems(result.items.slice(0, 5)))
      .catch(() => undefined);
  }, [token]);

  return (
    <div style={{ marginTop: 28 }}>
      <h2>Order history</h2>
      {items.length === 0 ? (
        <p className="muted">No orders yet.</p>
      ) : (
        <ul className="summary-list">
          {items.map((item) => (
            <li key={item.id}>
              <span>
                <Link to={`/orders/${item.id}`}>{item.summary || item.id.slice(0, 8)}</Link>
                <br />
                <span className="muted">
                  {item.status} · {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </span>
              <span>{money(item.total)}</span>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link to="/orders">View all orders</Link>
      </p>
    </div>
  );
}

function AddressBook({ token }: { token: string }) {
  const empty: AddressInput = {
    recipientName: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postal: "",
    country: "FI",
    phone: "",
    label: "Home",
  };
  const [items, setItems] = useState<SavedAddress[]>([]);
  const [form, setForm] = useState<AddressInput>(empty);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const result = await api<{ items: SavedAddress[] }>("/addresses", { token });
    setItems(result.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = addressSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the address");
      return;
    }
    try {
      await api("/addresses", {
        method: "POST",
        token,
        body: JSON.stringify({ ...parsed.data, isDefault: items.length === 0 }),
      });
      setMessage("Address saved.");
      setError("");
      setForm(empty);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function remove(id: string) {
    await api(`/addresses/${id}`, { method: "DELETE", token });
    await load();
  }

  return (
    <div style={{ marginTop: 28 }}>
      <h2>Addresses</h2>
      {message && <p className="banner ok">{message}</p>}
      {error && <p className="banner error">{error}</p>}
      {items.length === 0 && <p className="muted">No saved addresses yet. Checkout can add one.</p>}
      <ul className="summary-list">
        {items.map((item) => (
          <li key={item.id}>
            <span>
              {item.recipientName}, {item.line1}, {item.postal} {item.city}
              {item.isDefault ? " (default)" : ""}
            </span>
            <button className="link" type="button" onClick={() => void remove(item.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Label</span>
          <input value={form.label || ""} onChange={(event) => setForm({ ...form, label: event.target.value })} />
        </label>
        <label className="field">
          <span>Recipient</span>
          <input
            value={form.recipientName}
            onChange={(event) => setForm({ ...form, recipientName: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Street</span>
          <input value={form.line1} onChange={(event) => setForm({ ...form, line1: event.target.value })} />
        </label>
        <div className="dims">
          <label className="field">
            <span>City</span>
            <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </label>
          <label className="field">
            <span>Postal code</span>
            <input value={form.postal} onChange={(event) => setForm({ ...form, postal: event.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>Country</span>
          <select
            value={form.country}
            onChange={(event) => setForm({ ...form, country: event.target.value as AddressInput["country"] })}
          >
            {CHECKOUT_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Phone (optional)</span>
          <input value={form.phone || ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </label>
        <button className="primary" type="submit">
          Save address
        </button>
      </form>
    </div>
  );
}
