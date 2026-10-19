"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  CHECKOUT_COUNTRIES,
  addressSchema,
  isStaffRole,
  type AddressInput,
} from "@volt/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "./auth";

type SavedAddress = AddressInput & { id: string; label?: string | null; isDefault?: boolean };

export function AccountPage() {
  const { user, accessToken, ready, reloadUser, logout } = useAuth();
  const router = useRouter();
  const [setup, setSetup] = useState<{ qrDataUrl: string; otpauth: string } | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
      setMarketingOptIn(Boolean(user.marketingOptIn));
    }
  }, [user]);

  useEffect(() => {
    if (ready && (!user || !accessToken)) router.replace("/login");
  }, [ready, user, accessToken, router]);

  if (!ready || !user || !accessToken) return <p>Loading…</p>;

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
      <h1>Profile</h1>
      <p>
        {user.displayName || "Customer"} · {user.email}
      </p>
      {isStaffRole(user.role) ? (
        <div className="panel">
          <h2>Profile</h2>
          <label className="field">
            <span>Display name</span>
            <input value={user.displayName || ""} disabled readOnly />
          </label>
          <p className="muted">Only an admin can change employee names from Users.</p>
        </div>
      ) : (
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            void api("/auth/me", {
              method: "PATCH",
              token: accessToken,
              body: JSON.stringify({ displayName, marketingOptIn }),
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
          <label className="field choice">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(event) => setMarketingOptIn(event.target.checked)}
            />
            <span>Email me offers and product news</span>
          </label>
          <button className="primary" type="submit">
            Save profile
          </button>
        </form>
      )}
      <p>
        Two-factor authentication: <strong>{user.totpEnabled ? "Active" : "Off"}</strong>
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
      {!isStaffRole(user.role) && (
        <div className="panel">
          <h2>Delete account</h2>
          <p className="muted">
            This signs you out, turns off marketing, and erases your profile. Paid order records are
            kept until 31 December six years after the last paid order, as required for Finnish
            bookkeeping.
          </p>
          {!confirmDelete ? (
            <button className="ghost" type="button" onClick={() => setConfirmDelete(true)}>
              Delete my account
            </button>
          ) : (
            <div className="row-actions">
              <button
                className="primary"
                type="button"
                onClick={() => {
                  setError("");
                  void api("/account/deletion", { method: "POST", token: accessToken })
                    .then(async () => {
                      await logout();
                      router.replace("/");
                    })
                    .catch((err) => {
                      setError(err instanceof ApiError ? err.message : "Could not delete account");
                    });
                }}
              >
                Yes, delete my account
              </button>
              <button className="ghost" type="button" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      {!isStaffRole(user.role) && <AddressBook token={accessToken} />}
    </section>
  );
}

function emptyAddress(label = ""): AddressInput {
  return {
    recipientName: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postal: "",
    country: "FI",
    phone: "",
    label,
  };
}

function countryName(code: string) {
  return CHECKOUT_COUNTRIES.find((country) => country.code === code)?.name ?? code;
}

function AddressBook({ token }: { token: string }) {
  const [items, setItems] = useState<SavedAddress[]>([]);
  const [form, setForm] = useState<AddressInput>(emptyAddress("Home"));
  const [makeDefault, setMakeDefault] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const result = await api<{ items: SavedAddress[] }>("/addresses", { token });
    setItems(result.items);
    setError("");
    if (result.items.length === 0) {
      setAdding(true);
      setMakeDefault(true);
      setForm(emptyAddress("Home"));
    }
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  function startAdd() {
    setForm(emptyAddress(items.length === 0 ? "Home" : ""));
    setMakeDefault(items.length === 0);
    setAdding(true);
    setError("");
    setMessage("");
  }

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
        body: JSON.stringify({
          ...parsed.data,
          isDefault: items.length === 0 || makeDefault,
        }),
      });
      setMessage("Address saved.");
      setError("");
      setForm(emptyAddress());
      setAdding(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function setDefault(id: string) {
    setError("");
    try {
      await api(`/addresses/${id}/default`, { method: "POST", token });
      setMessage("Default address updated.");
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await api(`/addresses/${id}`, { method: "DELETE", token });
      setMessage("Address removed.");
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <div className="address-book">
      <h2>Addresses</h2>
      <p className="muted">Save more than one shipping address and choose which one checkout uses first.</p>
      {message && <p className="banner ok">{message}</p>}
      {error && <p className="banner error">{error}</p>}
      {items.length === 0 && !adding && <p className="muted">No saved addresses yet.</p>}
      <ul className="address-list">
        {items.map((item) => (
          <li key={item.id} className="address-card">
            <div>
              <div className="address-card-head">
                <strong>{item.label || "Address"}</strong>
                {item.isDefault && <span className="address-default">Default</span>}
              </div>
              <p>{item.recipientName}</p>
              <p>{item.line1}</p>
              {item.line2 ? <p>{item.line2}</p> : null}
              <p>
                {item.postal} {item.city}
              </p>
              {item.region ? <p>{item.region}</p> : null}
              <p>{countryName(item.country)}</p>
              {item.phone ? <p>{item.phone}</p> : null}
            </div>
            <div className="address-actions">
              {!item.isDefault && (
                <button className="link" type="button" onClick={() => void setDefault(item.id)}>
                  Set as default
                </button>
              )}
              <button className="link" type="button" onClick={() => void remove(item.id)}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!adding && (
        <button className="ghost" type="button" onClick={startAdd}>
          Add another address
        </button>
      )}
      {adding && (
        <form className="panel" onSubmit={(event) => void onSubmit(event)}>
          <h3>{items.length === 0 ? "Add an address" : "Add another address"}</h3>
          <label className="field">
            <span>Label</span>
            <input
              value={form.label || ""}
              placeholder="Home, work, cabin…"
              onChange={(event) => setForm({ ...form, label: event.target.value })}
            />
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
          <label className="field">
            <span>Apartment, suite (optional)</span>
            <input value={form.line2 || ""} onChange={(event) => setForm({ ...form, line2: event.target.value })} />
          </label>
          <div className="dims">
            <label className="field">
              <span>Postal code</span>
              <input value={form.postal} onChange={(event) => setForm({ ...form, postal: event.target.value })} />
            </label>
            <label className="field">
              <span>City</span>
              <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Region / state (optional)</span>
            <input value={form.region || ""} onChange={(event) => setForm({ ...form, region: event.target.value })} />
          </label>
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
          <label className="field choice">
            <input
              type="checkbox"
              checked={items.length === 0 || makeDefault}
              disabled={items.length === 0}
              onChange={(event) => setMakeDefault(event.target.checked)}
            />
            <span>Set as default address</span>
          </label>
          <div className="address-form-actions">
            <button className="primary" type="submit">
              Save address
            </button>
            {items.length > 0 && (
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setAdding(false);
                  setError("");
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
