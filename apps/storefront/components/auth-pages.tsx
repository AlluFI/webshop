"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, Suspense } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { isStaffRole, loginSchema, registerSchema, resetPasswordSchema } from "@volt/shared";
import { api, ApiError, recaptchaSiteKey } from "@/lib/api";
import { useAuth } from "./auth";
import { useI18n } from "./i18n";

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
  const { t } = useI18n();
  return (
    <div className="google-auth">
      <p className="auth-divider">
        <span>{t("auth.or")}</span>
      </p>
      <a className="google-btn" href="/api/v1/auth/google">
        <GoogleMark />
        {t("auth.google")}
      </a>
    </div>
  );
}

function useGoogleSignInEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let interval = 0;
    async function check() {
      try {
        const value = await api<{ configured: boolean }>("/auth/google/status");
        if (!cancelled) setEnabled(value.configured);
        return value.configured;
      } catch {
        // Storefront often boots before the API finishes migrate/seed.
        return false;
      }
    }
    void check().then((done) => {
      if (done || cancelled) return;
      interval = window.setInterval(() => {
        void check().then((ready) => {
          if (ready) window.clearInterval(interval);
        });
      }, 2000);
    });
    const stop = window.setTimeout(() => window.clearInterval(interval), 90_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, []);

  return enabled;
}

export function RegisterForm() {
  const { t } = useI18n();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [captcha, setCaptcha] = useState<string | null>(null);
  const google = useGoogleSignInEnabled();
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
      displayName: String(form.get("displayName") || "") || undefined,
      marketingOptIn: form.get("marketingOptIn") === "on",
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
      <h1>{t("auth.registerTitle")}</h1>
      {done && (
        <p className="banner ok">
          {done} {t("auth.mailpit")}
        </p>
      )}
      {error && <p className="banner error">{error}</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>{t("auth.name")}</span>
          <input name="displayName" autoComplete="name" />
        </label>
        <label className="field">
          <span>{t("auth.email")}</span>
          <input name="email" type="email" autoComplete="email" required />
          <FieldError message={fields.email} />
        </label>
        <label className="field">
          <span>{t("auth.password")}</span>
          <input name="password" type="password" autoComplete="new-password" required />
          <FieldError message={fields.password} />
        </label>
        <label className="field choice">
          <input name="marketingOptIn" type="checkbox" />
          <span>{t("auth.marketing")}</span>
        </label>
        <div className="field">
          <ReCAPTCHA sitekey={recaptchaSiteKey()} onChange={setCaptcha} />
          <FieldError message={fields.captchaToken} />
        </div>
        <button className="primary" type="submit">
          {t("auth.register")}
        </button>
      </form>
      {google && <GoogleSignInLink />}
      <p>
        {t("auth.haveAccount")} <Link href="/login">{t("nav.signIn")}</Link>
      </p>
    </div>
  );
}

function TwoFactorForm({
  error,
  onSubmit,
}: {
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <h1>{t("auth.mfaTitle")}</h1>
      {error && <p className="banner error">{error}</p>}
      <form autoComplete="off" onSubmit={onSubmit}>
        <label className="field">
          <span>{t("auth.totp")}</span>
          <input
            name="totpCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
          />
        </label>
        <label className="field">
          <span>{t("auth.backup")}</span>
          <input name="backupCode" type="text" autoComplete="off" />
        </label>
        <button className="primary" type="submit">
          {t("auth.continue")}
        </button>
      </form>
    </>
  );
}

export function LoginForm() {
  const { t } = useI18n();
  const { setSession } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [mfaToken, setMfaToken] = useState("");
  const google = useGoogleSignInEnabled();

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
        setError("");
        setMfaToken(result.mfaToken);
        return;
      }
      if (result.accessToken) {
        const profile = await setSession(result.accessToken);
        router.push(isStaffRole(profile.role) ? "/admin" : "/account");
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
      router.push(isStaffRole(profile.role) ? "/admin" : "/account");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  if (mfaToken) {
    return (
      <div className="auth-card">
        <TwoFactorForm key={mfaToken} error={error} onSubmit={(event) => void onMfa(event)} />
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>{t("auth.signInTitle")}</h1>
      {error && <p className="banner error">{error}</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>{t("auth.email")}</span>
          <input name="email" type="email" autoComplete="email" required />
          <FieldError message={fields.email} />
        </label>
        <label className="field">
          <span>{t("auth.password")}</span>
          <input name="password" type="password" autoComplete="current-password" required />
          <FieldError message={fields.password} />
        </label>
        <button className="primary" type="submit">
          {t("nav.signIn")}
        </button>
      </form>
      {google && <GoogleSignInLink />}
      <p>
        <Link href="/forgot-password">{t("auth.forgot")}</Link>
      </p>
    </div>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
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
      <h1>{t("auth.forgotTitle")}</h1>
      {message && <p className="banner ok">{message}</p>}
      {error && <p className="banner error">{error}</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>{t("auth.email")}</span>
          <input name="email" type="email" required />
        </label>
        <button className="primary" type="submit">
          {t("auth.sendReset")}
        </button>
      </form>
    </div>
  );
}

function ResetFormInner() {
  const { t } = useI18n();
  const params = useSearchParams();
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
      <h1>{t("auth.resetTitle")}</h1>
      {message && <p className="banner ok">{message}</p>}
      {error && <p className="banner error">{error}</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>{t("auth.newPassword")}</span>
          <input name="password" type="password" autoComplete="new-password" required />
        </label>
        <button className="primary" type="submit">
          {t("auth.updatePassword")}
        </button>
      </form>
    </div>
  );
}

export function ResetForm() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<p>{t("common.loading")}</p>}>
      <ResetFormInner />
    </Suspense>
  );
}

function VerifyInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "missing" | "verified" | "error">("verifying");
  const [error, setError] = useState("");
  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("missing");
      return;
    }
    void api("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => setStatus("verified"))
      .catch((err: Error) => {
        setError(err.message);
        setStatus("error");
      });
  }, [params]);
  const message =
    status === "missing"
      ? t("auth.missingToken")
      : status === "verified"
        ? t("auth.verified")
        : status === "error"
          ? error
          : t("auth.verifying");
  return (
    <div className="auth-card">
      <h1>{t("auth.verifyTitle")}</h1>
      <p>{message}</p>
      <Link href="/login">{t("nav.signIn")}</Link>
    </div>
  );
}

export function VerifyForm() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<p>{t("common.loading")}</p>}>
      <VerifyInner />
    </Suspense>
  );
}

export function OAuthCallback() {
  const { t } = useI18n();
  const { ready, user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    router.push(user ? "/account" : "/login");
  }, [ready, user, router]);
  return (
    <div className="auth-card">
      <p>{t("auth.oauth")}</p>
    </div>
  );
}

