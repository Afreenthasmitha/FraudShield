export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Cannot reach the FraudShield API. Start the FastAPI server and try again.");
  }
  if (!response.ok) {
    let detail = `Request failed (${response.status}).`;
    let parsedResponse = false;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? detail;
      parsedResponse = true;
    } catch {
      if (response.status >= 500) {
        detail = `API server or development proxy returned HTTP ${response.status}. Check the backend startup and Vite API target.`;
      }
    }
    if (parsedResponse && response.status >= 500 && detail.startsWith("Request failed")) {
      detail = `API server returned HTTP ${response.status}. Check the backend logs and Vite API target.`;
    }
    throw new ApiError(detail, response.status);
  }
  return (await response.json()) as T;
}
