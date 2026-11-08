"use client";

import { useState, type FormEvent } from "react";
import {
  CUSTOMER_REFUND_REASONS,
  STAFF_REFUND_REASONS,
  type RefundReasonCode,
} from "@volt/shared";
import { reasonKey } from "@/lib/i18n";
import { useI18n } from "./i18n";

export function RefundForm({
  staff = false,
  mode = "refund",
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  staff?: boolean;
  mode?: "refund" | "return";
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (body: { reason: RefundReasonCode; note?: string }) => void;
}) {
  const { t } = useI18n();
  const reasons = staff ? STAFF_REFUND_REASONS : CUSTOMER_REFUND_REASONS;
  const [reason, setReason] = useState<RefundReasonCode>(reasons[0].code);
  const [note, setNote] = useState("");
  const label = (en: string, key: Parameters<typeof t>[0]) => (staff ? en : t(key));

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ reason, note: note.trim() || undefined });
  }

  return (
    <form onSubmit={submit}>
      {error ? <p className="banner error">{error}</p> : null}
      <label className="field">
        <span>{label("Reason", "refund.reason")}</span>
        <select value={reason} onChange={(event) => setReason(event.target.value as RefundReasonCode)}>
          {reasons.map((option) => (
            <option key={option.code} value={option.code}>
              {staff ? option.label : t(reasonKey(option.code))}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>
          {reason === "other"
            ? label("Note (required)", "refund.noteRequired")
            : label("Note (optional)", "refund.noteOptional")}
        </span>
        <textarea
          rows={3}
          maxLength={240}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          required={reason === "other"}
        />
      </label>
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>
          {busy
            ? mode === "return"
              ? label("Sending…", "refund.returnBusy")
              : label("Refunding…", "refund.busy")
            : mode === "return"
              ? label("Confirm return", "refund.returnConfirm")
              : label("Confirm refund", "refund.confirm")}
        </button>
        <button className="ghost" type="button" disabled={busy} onClick={onCancel}>
          {label("Cancel", "common.cancel")}
        </button>
      </div>
    </form>
  );
}
