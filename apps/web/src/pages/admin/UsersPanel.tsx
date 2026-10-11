import { useEffect, useState } from "react";
import { ALL_ROLES } from "@volt/shared";
import { api, ApiError } from "../../api";

export function UsersPanel({ token }: { token: string }) {
  const [items, setItems] = useState<
    { id: string; email: string; role: string; totpEnabled: boolean }[]
  >([]);
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ items: typeof items }>("/admin/users", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [token]);

  async function assign(id: string, role: string) {
    setError("");
    try {
      await api(`/admin/users/${id}/role`, { method: "POST", token, body: JSON.stringify({ role }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign role");
    }
  }

  return (
    <div>
      {error && <p className="banner error">{error}</p>}
      <p className="muted">Staff roles require 2FA already enabled on the account.</p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">2FA</th>
              <th scope="col">Role</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

