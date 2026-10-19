import { useEffect, useState, type FormEvent } from "react";
import { ALL_ROLES, STAFF_ROLES, adminCreateEmployeeSchema, isStaffRole, updateProfileSchema } from "@volt/shared";
import { api, ApiError } from "@/lib/api";
import { Modal } from "./Modal";

type RoleFilter = "" | "staff" | (typeof STAFF_ROLES)[number];

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
  const [rename, setRename] = useState<UserRow | null>(null);
  const [renameName, setRenameName] = useState("");
  const [pendingRole, setPendingRole] = useState<{ user: UserRow; role: string } | null>(null);

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

  function requestRoleChange(item: UserRow, role: string) {
    if (!isStaffRole(item.role) || role === item.role) return;
    setError("");
    setPendingRole({ user: item, role });
  }

  async function confirmRoleChange() {
    if (!pendingRole) return;
    setError("");
    setBusy(true);
    try {
      await api(`/admin/users/${pendingRole.user.id}/role`, {
        method: "POST",
        token,
        body: JSON.stringify({ role: pendingRole.role }),
      });
      setPendingRole(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign role");
    } finally {
      setBusy(false);
    }
  }

  function openRename(item: UserRow) {
    setError("");
    setRename(item);
    setRenameName(item.displayName || "");
  }

  async function onRename(event: FormEvent) {
    event.preventDefault();
    if (!rename) return;
    setError("");
    const parsed = updateProfileSchema.safeParse({ displayName: renameName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the name");
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/users/${rename.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(parsed.data),
      });
      setRename(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the name");
    } finally {
      setBusy(false);
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
              <option value="">All employees</option>
              {STAFF_ROLES.map((role) => (
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
        Staff accounts only. Customer profiles live under <strong>Customers</strong>. Add staff with{" "}
        <strong>Add employee</strong>. Customer roles cannot be changed. Changing a
        staff role asks for confirmation. Only admins can change employee names.
      </p>
      <Modal
        open={Boolean(pendingRole)}
        title="Confirm role change"
        onClose={() => {
          if (!busy) setPendingRole(null);
        }}
      >
        {error && <p className="banner error">{error}</p>}
        <p>
          Change <strong>{pendingRole?.user.displayName || pendingRole?.user.email}</strong> from{" "}
          <strong>{pendingRole?.user.role}</strong> to <strong>{pendingRole?.role}</strong>?
        </p>
        <div className="actions">
          <button className="primary" type="button" disabled={busy} onClick={() => void confirmRoleChange()}>
            {busy ? "Saving…" : "Confirm"}
          </button>
          <button
            className="ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              setPendingRole(null);
              setError("");
            }}
          >
            Cancel
          </button>
        </div>
      </Modal>
      <Modal
        open={Boolean(rename)}
        title="Change employee name"
        onClose={() => {
          setRename(null);
          setError("");
        }}
      >
        {error && <p className="banner error">{error}</p>}
        <form onSubmit={(event) => void onRename(event)}>
          <label className="field">
            <span>Name</span>
            <input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <p className="muted">{rename?.email}</p>
          <div className="actions">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save name"}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setRename(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
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
                  <td>
                    <div className="copy-row">
                      <span>{item.displayName || "—"}</span>
                      {isStaffRole(item.role) && (
                        <button className="ghost" type="button" onClick={() => openRename(item)}>
                          Change
                        </button>
                      )}
                    </div>
                  </td>
                  <td>{item.email}</td>
                  <td>{item.totpEnabled ? "On" : "Off"}</td>
                  <td>
                    {isStaffRole(item.role) ? (
                      <select
                        value={item.role}
                        aria-label={`Role for ${item.displayName || item.email}`}
                        onChange={(e) => requestRoleChange(item, e.target.value)}
                      >
                        {ALL_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{item.role}</span>
                    )}
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
