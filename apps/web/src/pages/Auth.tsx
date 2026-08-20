import { useEffect, useState, type FormEvent } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginSchema, registerSchema, resetPasswordSchema } from "@volt/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";

const siteKey =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}

export function RegisterPage() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ configured: boolean }>("/auth/google/status")
      .then((value) => setGoogle(value.configured))
      .catch(() => setGoogle(false));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
      displayName: String(form.get("displayName") || "") || undefined,
      captchaToken: captcha || "",
    };
    const parsed = registerSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[String(issue.path[0])] = issue.message;
      }
      setFields(next);
      return;
    }
    setFields({});
    try {
      const result = await api<{ message: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setDone(result.message);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      }
    }
  }

  return (
    <div className="auth-card">
      <h1>Create an account</h1>
      {done && <p className="banner ok">{done} Open Mailpit at localhost:8025 if you are on Docker.</p>}
      {error && <p className="banner error">{error}</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Name</span>
          <input name="displayName" autoComplete="name" />
        </label>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
          <FieldError message={fields.email} />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="new-password" required />
          <FieldError message={fields.password} />
        </label>
        <div className="field">
          <ReCAPTCHA sitekey={siteKey} onChange={setCaptcha} />
          <FieldError message={fields.captchaToken} />
        </div>
        <button className="primary" type="submit">
          Register
        </button>
      </form>
      {google && (
        <p>
          <a href="/api/v1/auth/google">Continue with Google</a>
        </p>
      )}
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}

export function LoginPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [mfaToken, setMfaToken] = useState("");
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    void api<{ configured: boolean }>("/auth/google/status")
      .then((value) => setGoogle(value.configured))
      .catch(() => setGoogle(false));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    };
    const parsed = loginSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setFields(next);
      return;
    }
    try {
      const result = await api<{
        accessToken?: string;
        mfaRequired?: boolean;
        mfaToken?: string;
      }>("/auth/login", { method: "POST", body: JSON.stringify(parsed.data) });
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
        return;
      }
      if (result.accessToken) {
        await setSession(result.accessToken);
        navigate("/account");
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function onMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ accessToken: string }>("/auth/mfa/complete", {
        method: "POST",
        body: JSON.stringify({
          mfaToken,
          totpCode: String(form.get("totpCode") || "") || undefined,
          backupCode: String(form.get("backupCode") || "") || undefined,
        }),
      });
      await setSession(result.accessToken);
      navigate("/account");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  if (mfaToken) {
    return (
      <div className="auth-card">
        <h1>Two-factor code</h1>
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void onMfa(event)}>
          <label className="field">
            <span>Authenticator code</span>
            <input name="totpCode" inputMode="numeric" autoComplete="one-time-code" />
          </label>
          <label className="field">
            <span>Or backup code</span>
            <input name="backupCode" autoComplete="off" />
          </label>
          <button className="primary" type="submit">
            Continue
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>Sign in</h1>
      {error && <p className="banner error">{error}</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
          <FieldError message={fields.email} />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
          <FieldError message={fields.password} />
        </label>
        <button className="primary" type="submit">
          Sign in
        </button>
      </form>
      {google && (
        <p>
          <a href="/api/v1/auth/google">Continue with Google</a>
        </p>
      )}
      <p>
        <Link to="/forgot-password">Forgot password?</Link>
      </p>
    </div>
  );
}

export function VerifyPage() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState("Verifying…");
  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setMessage("Missing verification token.");
      return;
    }
    void api("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => setMessage("Email verified. You can sign in."))
      .catch((err: Error) => setMessage(err.message));
  }, [params]);
  return (
    <div className="auth-card">
      <h1>Verify email</h1>
      <p>{message}</p>
      <Link to="/login">Sign in</Link>
    </div>
  );
}

export function ForgotPage() {
  const [message, setMessage] = useState("");
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await api<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: String(form.get("email") || "") }),
    });
    setMessage(result.message);
  }
  return (
    <div className="auth-card">
      <h1>Reset password</h1>
      {message && <p className="banner ok">{message}</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required />
        </label>
        <button className="primary" type="submit">
          Send reset link
        </button>
      </form>
    </div>
  );
}

export function ResetPage() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = resetPasswordSchema.safeParse({
      token: params.get("token") || "",
      password: String(form.get("password") || ""),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    try {
      const result = await api<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setMessage(result.message);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }
  return (
    <div className="auth-card">
      <h1>Choose a new password</h1>
      {message && <p className="banner ok">{message}</p>}
      {error && <p className="banner error">{error}</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>New password</span>
          <input name="password" type="password" autoComplete="new-password" required />
        </label>
        <button className="primary" type="submit">
          Update password
        </button>
      </form>
    </div>
  );
}

export function OAuthCallbackPage() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    void refreshSession().then((ok) => navigate(ok ? "/account" : "/login"));
  }, [navigate, refreshSession]);
  return (
    <div className="auth-card">
      <p>Finishing Google sign-in…</p>
    </div>
  );
}
