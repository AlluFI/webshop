"use client";

import { useState, type FormEvent } from "react";
import {
  CUSTOMER_REFUND_REASONS,
  STAFF_REFUND_REASONS,
  type RefundReasonCode,
} from "@volt/shared";

export function RefundForm({
  staff = false,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  staff?: boolean;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (body: { reason: RefundReasonCode; note?: string }) => void;
}) {
  const reasons = staff ? STAFF_REFUND_REASONS : CUSTOMER_REFUND_REASONS;
  const [reason, setReason] = useState<RefundReasonCode>(reasons[0].code);
  const [note, setNote] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ reason, note: note.trim() || undefined });
  }

  return (
    <form onSubmit={submit}>
      {error ? <p className="banner error">{error}</p> : null}
      <label className="field">
        <span>Reason</span>
        <select value={reason} onChange={(event) => setReason(event.target.value as RefundReasonCode)}>
          {reasons.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{reason === "other" ? "Note (required)" : "Note (optional)"}</span>
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
          {busy ? "Refunding…" : "Confirm refund"}
        </button>
        <button className="ghost" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
