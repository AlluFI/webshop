"use client";

import { useState, type FormEvent } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { contactSchema } from "@volt/shared";
import { api, ApiError, recaptchaSiteKey } from "@/lib/api";

export function ContactForm() {
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      subject: String(form.get("subject") || ""),
      message: String(form.get("message") || ""),
      captchaToken: captcha || "",
    };
    const parsed = contactSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the form");
      return;
    }
    try {
      const result = await api<{ message: string }>("/contact", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setDone(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the message");
    }
  }

  return (
    <section className="auth-card" style={{ maxWidth: 560 }}>
      <h1>Contact</h1>
      <p className="muted">Questions about an order, a spec, or a review? We read every note.</p>
      {done && <p className="banner ok">{done} Check Mailpit on port 8025 in Docker.</p>}
      {error && <p className="banner error">{error}</p>}
      {!done && (
        <form onSubmit={(event) => void onSubmit(event)}>
          <label className="field">
            <span>Name</span>
            <input name="name" required autoComplete="name" />
          </label>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="field">
            <span>Subject</span>
            <input name="subject" required />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea name="message" rows={5} required />
          </label>
          <ReCAPTCHA sitekey={recaptchaSiteKey()} onChange={setCaptcha} />
          <div className="actions">
            <button className="primary" type="submit">
              Send
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
