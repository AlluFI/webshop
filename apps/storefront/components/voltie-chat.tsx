"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/product";
import { useAuth } from "./auth";

type UiBlock =
  | { type: "products"; items: { name: string; slug: string; href: string; price: number }[] }
  | { type: "confirm_claim"; orderId: string; reference: string; reason: string }
  | { type: "ticket"; reference: string; externalKey: string }
  | { type: "did_you_mean"; suggestion: string };

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  uiBlocks?: UiBlock[];
};

const THREAD_KEY = "voltie_thread";

export function VoltieChat() {
  const pathname = usePathname();
  const { accessToken, user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const hidden = pathname.startsWith("/admin");

  useEffect(() => {
    if (!open) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [open, messages]);

  async function ensureThread() {
    if (threadId) return threadId;
    const stored = sessionStorage.getItem(THREAD_KEY);
    if (stored) {
      setThreadId(stored);
      const data = await api<{ items: ChatMessage[] }>(`/assistant/threads/${stored}/messages`, {
        token: accessToken,
      });
      setMessages(data.items);
      return stored;
    }
    const created = await api<{ id: string }>("/assistant/threads", { method: "POST", token: accessToken });
    sessionStorage.setItem(THREAD_KEY, created.id);
    setThreadId(created.id);
    return created.id;
  }

  async function sendText(content: string) {
    if (!content || busy) return;
    setBusy(true);
    setError("");
    setDraft("");
    setMessages((current) => [...current, { id: `local-${Date.now()}`, role: "user", content }]);
    try {
      const id = await ensureThread();
      const reply = await api<ChatMessage>(`/assistant/threads/${id}/messages`, {
        method: "POST",
        token: accessToken,
        body: JSON.stringify({ content }),
      });
      setMessages((current) => [...current, reply]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Voltie could not reply");
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    await sendText(draft.trim());
  }

  async function confirmClaim(block: Extract<UiBlock, { type: "confirm_claim" }>) {
    if (!threadId) return;
    setBusy(true);
    setError("");
    try {
      const reply = await api<ChatMessage>(`/assistant/threads/${threadId}/claim`, {
        method: "POST",
        token: accessToken,
        body: JSON.stringify({ orderId: block.orderId, reason: block.reason }),
      });
      setMessages((current) => [...current, reply]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open the claim");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || hidden) return null;

  return (
    <div className="voltie">
      {open ? (
        <section className="voltie-panel" aria-label="Voltie shop assistant">
          <header className="voltie-head">
            <div>
              <p className="kicker">Shop assistant</p>
              <strong>Voltie</strong>
            </div>
            <button className="ghost" type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>
          <div className="voltie-log" ref={scroller}>
            <p className="voltie-bubble assistant">
              {user
                ? "Ask me about products, shipping, or an order on this account. I can email support (demo Jira ticket) or open a claim after you confirm."
                : "Ask me about products, shipping, or returns. Sign in to talk about an order you placed. I never look up someone else’s order."}
            </p>
            {messages.map((message) => (
              <div key={message.id} className={`voltie-bubble ${message.role}`}>
                <p>{message.content}</p>
                {message.uiBlocks?.map((block, index) => {
                  if (block.type === "products") {
                    return (
                      <ul key={`${message.id}-p-${index}`} className="voltie-products">
                        {block.items.map((item) => (
                          <li key={item.slug}>
                            <Link href={item.href} onClick={() => setOpen(false)}>
                              {item.name}
                            </Link>
                            <span>{money(item.price)}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  if (block.type === "confirm_claim") {
                    return (
                      <button
                        key={`${message.id}-c-${index}`}
                        className="primary"
                        type="button"
                        disabled={busy}
                        onClick={() => void confirmClaim(block)}
                      >
                        Confirm claim on {block.reference}
                      </button>
                    );
                  }
                  if (block.type === "did_you_mean") {
                    return (
                      <button
                        key={`${message.id}-d-${index}`}
                        className="primary"
                        type="button"
                        disabled={busy}
                        onClick={() => void sendText(block.suggestion)}
                      >
                        Use “{block.suggestion}”
                      </button>
                    );
                  }
                  return (
                    <p key={`${message.id}-t-${index}`} className="muted">
                      Ticket {block.reference} · {block.externalKey}
                    </p>
                  );
                })}
              </div>
            ))}
          </div>
          {error ? <p className="banner error">{error}</p> : null}
          <form className="voltie-form" onSubmit={(event) => void send(event)}>
            <label className="skip" htmlFor="voltie-input">
              Message Voltie
            </label>
            <input
              id="voltie-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask Voltie…"
              maxLength={2000}
            />
            <button className="primary" type="submit" disabled={busy || !draft.trim()}>
              {busy ? "…" : "Send"}
            </button>
          </form>
        </section>
      ) : (
        <button className="voltie-fab" type="button" onClick={() => { setOpen(true); void ensureThread().catch((err: Error) => setError(err.message)); }}>
          Voltie
        </button>
      )}
    </div>
  );
}
