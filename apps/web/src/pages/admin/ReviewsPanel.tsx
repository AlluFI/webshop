import { useEffect, useState } from "react";
import { api } from "../../api";

export function ReviewsPanel({ token }: { token: string }) {
  const [items, setItems] = useState<
    { id: string; body: string; stars: number; status: string; product: { name: string }; author: string }[]
  >([]);

  async function load() {
    const data = await api<{ items: typeof items }>("/admin/reviews", { token });
    setItems(data.items);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, [token]);

  async function moderate(id: string, status: "PUBLISHED" | "HIDDEN") {
    await api(`/admin/reviews/${id}/moderate`, { method: "POST", token, body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Stars</th>
            <th scope="col">Product</th>
            <th scope="col">Author</th>
            <th scope="col">Status</th>
            <th scope="col">Review</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.stars}★</td>
              <td>{item.product.name}</td>
              <td>{item.author}</td>
              <td>{item.status}</td>
              <td>{item.body}</td>
              <td>
                <button
                  className="link"
                  type="button"
                  onClick={() => void moderate(item.id, item.status === "HIDDEN" ? "PUBLISHED" : "HIDDEN")}
                >
                  {item.status === "HIDDEN" ? "Publish" : "Hide"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

