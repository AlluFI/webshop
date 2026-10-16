import { useEffect, useState, type FormEvent } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginSchema, registerSchema, resetPasswordSchema, isStaffRole } from "@volt/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { PageMeta } from "../seo";

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

function GoogleMark() {
  return (
    <svg className="google-btn__icon" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function GoogleSignInLink() {
  return (
    <div className="google-auth">
      <p className="auth-divider">
        <span>or</span>
      </p>
      <a className="google-btn" href="/api/v1/auth/google">
        <GoogleMark />
        Continue with Google
      </a>
    </div>
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
      <PageMeta
        title="Register — Volt & Co"
        description="Create a Volt & Co account to save addresses, track orders, and leave reviews on products you bought."
      />
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
      {google && <GoogleSignInLink />}
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
        const profile = await setSession(result.accessToken);
        navigate(isStaffRole(profile.role) ? "/admin" : "/account");
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
      const profile = await setSession(result.accessToken);
      navigate(isStaffRole(profile.role) ? "/admin" : "/account");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  if (mfaToken) {
    return (
      <div className="auth-card">
        <PageMeta
          title="Two-factor — Volt & Co"
          description="Enter your authenticator code to finish signing in to a Volt & Co staff or customer account."
        />
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
      <PageMeta
        title="Sign in — Volt & Co"
        description="Sign in to Volt & Co to manage orders, addresses, and reviews. Staff accounts require two-factor authentication."
      />
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
      {google && <GoogleSignInLink />}
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
      <PageMeta title="Verify email — Volt & Co" description="Confirm your Volt & Co email address so you can sign in and place orders." />
      <h1>Verify email</h1>
      <p>{message}</p>
      <Link to="/login">Sign in</Link>
    </div>
  );
}

export function ForgotPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: String(form.get("email") || "") }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a reset link. Try again.");
    }
  }
  return (
    <div className="auth-card">
      <PageMeta
        title="Reset password — Volt & Co"
        description="Request a Volt & Co password reset link. We email it to Mailpit in this sandbox environment."
      />
      <h1>Reset password</h1>
      {message && <p className="banner ok">{message}</p>}
      {error && <p className="banner error">{error}</p>}
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
      <PageMeta title="New password — Volt & Co" description="Choose a new password for your Volt & Co account using the reset link from email." />
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
  const { ready, user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!ready) return;
    navigate(user ? "/account" : "/login");
  }, [navigate, ready, user]);
  return (
    <div className="auth-card">
      <p>Finishing Google sign-in…</p>
    </div>
  );
}
