import { useState } from "react";
import { api, ApiError } from "@/lib/api";

export function BulkPanel({ token }: { token: string }) {
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function onFile(file: File | null) {
    if (!file) return;
    setError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const data = await api<{ created: number; errors: { row: number; error: string }[] }>(
        "/admin/products/bulk",
        { method: "POST", token, body },
      );
      setResult(`Created ${data.created}. ${data.errors.length} row errors.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    }
  }

  return (
    <div className="panel">
      <h2>Bulk upload</h2>
      <p className="muted">
        CSV headers: name, description, price, stockQuantity, category, brand, weightKg, lengthCm, widthCm,
        heightCm. JSON is an array of the same fields.
      </p>
      {error && <p className="banner error">{error}</p>}
      {result && <p className="banner ok">{result}</p>}
      <input
        type="file"
        accept=".csv,.json,application/json,text/csv"
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
