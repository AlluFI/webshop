import { useEffect, useState, type FormEvent } from "react";
import { ALL_ROLES, STAFF_ROLES, adminCreateEmployeeSchema } from "@volt/shared";
import { api, ApiError } from "../../api";
import { Modal } from "./Modal";

type RoleFilter = "" | "staff" | (typeof ALL_ROLES)[number];

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  totpEnabled: boolean;
};

type CreatedEmployee = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  totpSecret: string;
  qrDataUrl: string;
  backupCodes: string[];
};

const emptyForm = {
  displayName: "",
  email: "",
  password: "",
  role: "support" as (typeof STAFF_ROLES)[number],
};

function suggestPassword() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `Shop${n}Temp`;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function UsersPanel({ token }: { token: string }) {
  const [items, setItems] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [created, setCreated] = useState<CreatedEmployee | null>(null);
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("");

  async function load(nextRole = roleFilter) {
    const query = new URLSearchParams({ pageSize: "50" });
    if (nextRole) query.set("role", nextRole);
    const data = await api<{ items: UserRow[] }>(`/admin/users?${query}`, { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load(roleFilter).catch((err: Error) => setError(err.message));
  }, [token, roleFilter]);

  function closeForm() {
    setOpen(false);
    setCreated(null);
    setForm(emptyForm);
    setCopied("");
    setError("");
  }

  function openCreate() {
    setError("");
    setCreated(null);
    setForm(emptyForm);
    setCopied("");
    setOpen(true);
  }

  async function assign(id: string, role: string) {
    setError("");
    try {
      await api(`/admin/users/${id}/role`, { method: "POST", token, body: JSON.stringify({ role }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign role");
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = adminCreateEmployeeSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the employee details");
      return;
    }
    setBusy(true);
    try {
      const result = await api<CreatedEmployee>("/admin/users", {
        method: "POST",
        token,
        body: JSON.stringify(parsed.data),
      });
      setCreated(result);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add employee");
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await copyText(value);
      setCopied(label);
    } catch {
      setCopied("");
      setError("Could not copy to the clipboard");
    }
  }

  return (
    <div>
      {error && !open && <p className="banner error">{error}</p>}
      <div className="toolbar">
        <h2>Users</h2>
        <div className="toolbar-actions">
          <label className="field">
            <span>Role</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            >
              <option value="">All</option>
              <option value="staff">All employees</option>
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" type="button" onClick={openCreate}>
            Add employee
          </button>
        </div>
      </div>
      <p className="muted">
        Add staff here, or promote an existing customer after they have enabled 2FA on their Account
        page.
      </p>
      <Modal open={open} title={created ? "Employee created" : "Add employee"} onClose={closeForm}>
        {error && <p className="banner error">{error}</p>}
        {created ? (
          <div className="employee-handoff">
            <p>
              Share the password you set, this QR code, and the backup codes with{" "}
              <strong>{created.displayName || created.email}</strong> once. They can sign in
              immediately as <strong>{created.role}</strong>.
            </p>
            <img src={created.qrDataUrl} alt="Authenticator QR code for the new employee" width={180} height={180} />
            <label className="field">
              <span>Authenticator secret</span>
              <div className="copy-row">
                <code>{created.totpSecret}</code>
                <button className="ghost" type="button" onClick={() => void copy("secret", created.totpSecret)}>
                  {copied === "secret" ? "Copied" : "Copy"}
                </button>
              </div>
            </label>
            <label className="field">
              <span>Backup codes</span>
              <div className="copy-row">
                <code>{created.backupCodes.join(" ")}</code>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => void copy("codes", created.backupCodes.join("\n"))}
                >
                  {copied === "codes" ? "Copied" : "Copy"}
                </button>
              </div>
            </label>
            <div className="actions">
              <button className="primary" type="button" onClick={closeForm}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void onCreate(event)}>
            <label className="field">
              <span>Name</span>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="off"
                required
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as (typeof STAFF_ROLES)[number] })}
              >
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Temporary password</span>
              <div className="copy-row">
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                  required
                />
                <button className="ghost" type="button" onClick={() => setForm({ ...form, password: suggestPassword() })}>
                  Suggest
                </button>
              </div>
            </label>
            <p className="muted">
              Use at least 8 characters with upper, lower, and a number. 2FA is turned on for the
              account so they can sign in after you hand over the QR code.
            </p>
            <div className="actions">
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create employee"}
              </button>
              <button className="ghost" type="button" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">2FA</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4}>No users match this role filter.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.displayName || "—"}</td>
                  <td>{item.email}</td>
                  <td>{item.totpEnabled ? "On" : "Off"}</td>
                  <td>
                    <select value={item.role} onChange={(e) => void assign(item.id, e.target.value)}>
                      {ALL_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
