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

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  const token = tokens.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers, credentials: 'include' });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? body?.message ?? '요청을 처리하지 못했어요.');
  return body as T;
}
