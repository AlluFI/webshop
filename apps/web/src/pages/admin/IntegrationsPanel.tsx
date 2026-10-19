import { useEffect, useState, type FormEvent } from "react";
import { INTEGRATION_EVENTS, INTEGRATION_SCOPES, type IntegrationEvent, type IntegrationScope } from "@volt/shared";
import { api, ApiError } from "../../api";
import { Modal } from "./Modal";

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type WebhookRow = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastSentAt: string | null;
  createdAt: string;
};

type CreatedKey = KeyRow & { token: string };
type CreatedWebhook = WebhookRow & { secret: string };

const defaultScopes: IntegrationScope[] = ["orders", "catalog", "customers"];

function toggleValue<T extends string>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function IntegrationsPanel({ token }: { token: string }) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [error, setError] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [hookOpen, setHookOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [scopes, setScopes] = useState<IntegrationScope[]>(defaultScopes);
  const [hookName, setHookName] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [events, setEvents] = useState<IntegrationEvent[]>(["order.paid", "order.updated"]);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [createdHook, setCreatedHook] = useState<CreatedWebhook | null>(null);
  const [copied, setCopied] = useState("");

  async function load() {
    const [keyData, hookData] = await Promise.all([
      api<{ items: KeyRow[] }>("/admin/integrations/keys", { token }),
      api<{ items: WebhookRow[] }>("/admin/integrations/webhooks", { token }),
    ]);
    setKeys(keyData.items);
    setWebhooks(hookData.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }

  async function onCreateKey(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<CreatedKey>("/admin/integrations/keys", {
        method: "POST",
        token,
        body: JSON.stringify({ name: keyName, scopes }),
      });
      setCreatedKey(created);
      setKeyName("");
      setScopes(defaultScopes);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the API key");
    }
  }

  async function onRevoke(id: string) {
    if (!window.confirm("Revoke this key? Connected BI tools will stop immediately.")) return;
    setError("");
    try {
      await api(`/admin/integrations/keys/${id}/revoke`, { method: "POST", token });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not revoke the key");
    }
  }

  async function onCreateHook(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const created = await api<CreatedWebhook>("/admin/integrations/webhooks", {
        method: "POST",
        token,
        body: JSON.stringify({ name: hookName, url: hookUrl, events }),
      });
      setCreatedHook(created);
      setHookName("");
      setHookUrl("");
      setEvents(["order.paid", "order.updated"]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the webhook");
    }
  }

  async function onDeleteHook(id: string) {
    if (!window.confirm("Delete this webhook endpoint?")) return;
    setError("");
    try {
      await api(`/admin/integrations/webhooks/${id}`, { method: "DELETE", token });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the webhook");
    }
  }

  return (
    <div>
      {error && !keyOpen && !hookOpen && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Integrations</h2>
        <div className="toolbar-actions">
          <button className="ghost" type="button" onClick={() => { setError(""); setCreatedHook(null); setHookOpen(true); }}>
            Add webhook
          </button>
          <button className="primary" type="button" onClick={() => { setError(""); setCreatedKey(null); setKeyOpen(true); }}>
            Add API key
          </button>
        </div>
      </div>
      <p className="muted">
        Machine keys and signed webhooks for BI tools and SaaS platforms. Pull exports from{" "}
        <code>/api/v1/integrations/v1</code>. Warehouse SQL views are <code>analytics_*</code>. Full cutover notes
        are in <code>docs/INTEGRATIONS.md</code>.
      </p>

      <h3>API keys</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Prefix</th>
              <th scope="col">Scopes</th>
              <th scope="col">Last used</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No keys yet. Create one for Metabase, Power BI, or a custom connector.
                </td>
              </tr>
            ) : (
              keys.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>
                    <code>{row.keyPrefix}…</code>
                  </td>
                  <td>{row.scopes.join(", ")}</td>
                  <td>{row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : "—"}</td>
                  <td>{row.revokedAt ? "Revoked" : "Active"}</td>
                  <td>
                    {!row.revokedAt ? (
                      <button className="link" type="button" onClick={() => void onRevoke(row.id)}>
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3>Webhooks</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">URL</th>
              <th scope="col">Events</th>
              <th scope="col">Last delivery</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No endpoints yet. Add an HTTPS URL to receive order and deletion events.
                </td>
              </tr>
            ) : (
              webhooks.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.url}</td>
                  <td>{row.events.join(", ")}</td>
                  <td>
                    {row.lastStatus != null ? `HTTP ${row.lastStatus}` : "—"}
                    {row.lastError ? ` · ${row.lastError}` : ""}
                  </td>
                  <td>
                    <button className="link" type="button" onClick={() => void onDeleteHook(row.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={keyOpen}
        title="Add API key"
        onClose={() => {
          setKeyOpen(false);
          setCreatedKey(null);
          setCopied("");
        }}
      >
        {error && <p className="banner error">{error}</p>}
        {createdKey ? (
          <div>
            <p className="banner ok">Copy this token now. It is not shown again.</p>
            <label className="field">
              <span>Token</span>
              <input value={createdKey.token} readOnly />
            </label>
            <div className="actions">
              <button className="primary" type="button" onClick={() => void copyText(createdKey.token, "key")}>
                {copied === "key" ? "Copied" : "Copy token"}
              </button>
              <button className="ghost" type="button" onClick={() => { setKeyOpen(false); setCreatedKey(null); }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void onCreateKey(event)}>
            <label className="field">
              <span>Name</span>
              <input value={keyName} onChange={(e) => setKeyName(e.target.value)} required autoFocus maxLength={80} />
            </label>
            <fieldset className="field">
              <legend>Scopes</legend>
              {INTEGRATION_SCOPES.map((scope) => (
                <label key={scope} className="field choice">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => setScopes(toggleValue(scopes, scope))}
                  />
                  {scope}
                  {scope === "pii" ? " (email and display name)" : ""}
                </label>
              ))}
            </fieldset>
            <div className="actions">
              <button className="primary" type="submit" disabled={!scopes.length}>
                Create key
              </button>
              <button className="ghost" type="button" onClick={() => setKeyOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={hookOpen}
        title="Add webhook"
        onClose={() => {
          setHookOpen(false);
          setCreatedHook(null);
          setCopied("");
        }}
      >
        {error && <p className="banner error">{error}</p>}
        {createdHook ? (
          <div>
            <p className="banner ok">Copy this signing secret now. It is not shown again.</p>
            <label className="field">
              <span>Secret</span>
              <input value={createdHook.secret} readOnly />
            </label>
            <div className="actions">
              <button className="primary" type="button" onClick={() => void copyText(createdHook.secret, "hook")}>
                {copied === "hook" ? "Copied" : "Copy secret"}
              </button>
              <button className="ghost" type="button" onClick={() => { setHookOpen(false); setCreatedHook(null); }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void onCreateHook(event)}>
            <label className="field">
              <span>Name</span>
              <input value={hookName} onChange={(e) => setHookName(e.target.value)} required autoFocus maxLength={80} />
            </label>
            <label className="field">
              <span>URL</span>
              <input
                value={hookUrl}
                onChange={(e) => setHookUrl(e.target.value)}
                required
                type="url"
                placeholder="https://hooks.example.com/volt"
              />
            </label>
            <fieldset className="field">
              <legend>Events</legend>
              {INTEGRATION_EVENTS.map((eventName) => (
                <label key={eventName} className="field choice">
                  <input
                    type="checkbox"
                    checked={events.includes(eventName)}
                    onChange={() => setEvents(toggleValue(events, eventName))}
                  />
                  {eventName}
                </label>
              ))}
            </fieldset>
            <div className="actions">
              <button className="primary" type="submit" disabled={!events.length}>
                Create webhook
              </button>
              <button className="ghost" type="button" onClick={() => setHookOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
