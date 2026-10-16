export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api/v1";

type Options = RequestInit & { token?: string | null; orderToken?: string | null };

export const NETWORK_ERROR_MESSAGE =
  "We could not reach the server. Check your connection and try again.";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }

  get isNetwork() {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

export function userErrorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && (err.name === "TypeError" || /fetch|network/i.test(err.message))) {
    return NETWORK_ERROR_MESSAGE;
  }
  return fallback;
}

function messageForStatus(status: number, fallback?: string) {
  if (status === 504) return fallback || "The payment provider timed out. Please try again.";
  if (status === 502 || status === 503) {
    return fallback || "The server is temporarily unavailable. Please try again in a moment.";
  }
  return fallback || "Request failed";
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.orderToken) headers.set("X-Order-Token", options.orderToken);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    throw new ApiError(aborted ? "The request was cancelled." : NETWORK_ERROR_MESSAGE, 0, {
      network: NETWORK_ERROR_MESSAGE,
    });
  }

  const text = await response.text();
  let data: { error?: string; fields?: Record<string, string> } = {};
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string; fields?: Record<string, string> };
    } catch {
      throw new ApiError(
        response.ok
          ? "The server sent an unexpected response."
          : messageForStatus(response.status),
        response.status,
        { network: messageForStatus(response.status) },
      );
    }
  }

  if (!response.ok) {
    const message = data.error || messageForStatus(response.status);
    const fields = data.fields ?? (response.status >= 500 ? { network: message } : undefined);
    throw new ApiError(message, response.status, fields);
  }
  return data as T;
}

export function recaptchaSiteKey() {
  return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
}

export function storeOrderToken(orderId: string, token: string) {
  sessionStorage.setItem(`volt.order.${orderId}`, token);
}

export function readOrderToken(orderId: string) {
  return sessionStorage.getItem(`volt.order.${orderId}`);
}
