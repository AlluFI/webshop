import { ApiError } from "./api";

const BASE = process.env.API_INTERNAL_URL || "http://127.0.0.1:3000/api/v1";

function messageForStatus(status: number) {
  if (status === 404) return "Not found";
  if (status >= 500) return "The server is temporarily unavailable. Please try again in a moment.";
  return "Request failed";
}

export async function serverApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
    next: { revalidate: 60 },
  });

  const text = await response.text();
  let data: { error?: string } = {};
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string };
    } catch {
      throw new ApiError(messageForStatus(response.status), response.status);
    }
  }

  if (!response.ok) {
    throw new ApiError(data.error || messageForStatus(response.status), response.status);
  }
  return data as T;
}
