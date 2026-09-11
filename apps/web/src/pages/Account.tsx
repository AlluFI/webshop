import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";

export function AccountPage() {
  const { user, accessToken, ready, reloadUser } = useAuth();
  const [setup, setSetup] = useState<{ qrDataUrl: string; otpauth: string } | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
      <h1>Your account</h1>
      <p>
        {user.displayName || "Customer"} · {user.email}
      </p>
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
      {user.totpEnabled && (
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
    </section>
  );
}
