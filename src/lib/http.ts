const tokenKey = 'mowoo.accessToken';

export const tokens = {
  get: () => sessionStorage.getItem(tokenKey),
  set: (value: string) => {
    sessionStorage.setItem(tokenKey, value);
    window.dispatchEvent(new Event('mowoo:auth-change'));
  },
  clear: () => {
    sessionStorage.removeItem(tokenKey);
    window.dispatchEvent(new Event('mowoo:auth-change'));
  },
};

/** Server error with the backend's error code (ErrorResponse.error.code). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string | null) { super(message); }
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  const token = tokens.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers, credentials: 'include' });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(body?.error?.message ?? body?.message ?? '요청을 처리하지 못했어요.', response.status, body?.error?.code ?? null);
  return body as T;
}
