const tokenKey = 'mowoo.accessToken';
let sessionVersion = 0;

export const tokens = {
  get: () => sessionStorage.getItem(tokenKey),
  set: (value: string) => {
    sessionVersion++;
    sessionStorage.setItem(tokenKey, value);
    window.dispatchEvent(new Event('mowoo:auth-change'));
  },
  clear: () => {
    sessionVersion++;
    sessionStorage.removeItem(tokenKey);
    window.dispatchEvent(new Event('mowoo:auth-change'));
  },
};

/** Server error with the backend's error code (ErrorResponse.error.code). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string | null) { super(message); }
}

const sessionChanged = () => new ApiError('로그인 상태가 변경됐어요. 다시 시도해 주세요.', 401, 'SESSION_CHANGED');
const sessionExpired = () => new ApiError('로그인이 만료됐어요. 다시 로그인해 주세요.', 401, 'SESSION_EXPIRED');
const publicAuth = (url: string) => /^\/api\/v1\/auth\/(kakao|google|naver|reissue)\/?$/.test(new URL(url, location.origin).pathname);
let refreshFlight: { version: number; promise: Promise<string> } | null = null;

function expire(version: number) {
  if (sessionVersion !== version) return;
  tokens.clear();
  window.dispatchEvent(new Event('mowoo:auth-expired'));
}

function refresh(version: number): Promise<string> {
  if (refreshFlight?.version === version) return refreshFlight.promise;
  const flight = { version, promise: Promise.resolve('') };
  flight.promise = (async () => {
    try {
      // Refresh uses only the HttpOnly cookie, never an expired Bearer token.
      const response = await fetch('/api/v1/auth/reissue', { method: 'POST', credentials: 'include', signal: AbortSignal.timeout(15000) });
      const body = await response.json().catch(() => null);
      if (sessionVersion !== version) throw sessionChanged();
      if (!response.ok || typeof body?.accessToken !== 'string' || !body.accessToken.trim()) throw sessionExpired();
      // Token rotation is not a new login: preserve user state and character selection.
      sessionStorage.setItem(tokenKey, body.accessToken);
      return body.accessToken as string;
    } catch (error) {
      if (sessionVersion !== version) throw sessionChanged();
      expire(version);
      throw error instanceof ApiError ? error : sessionExpired();
    } finally {
      if (refreshFlight === flight) refreshFlight = null;
    }
  })();
  refreshFlight = flight;
  return flight.promise;
}

function waitForRefresh(promise: Promise<string>, signal?: AbortSignal | null): Promise<string> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('요청이 취소됐어요.', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('요청이 취소됐어요.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = tokens.get();
  const version = sessionVersion;
  const anonymous = publicAuth(url);
  const send = (accessToken: string | null) => {
    const headers = new Headers(options.headers);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (anonymous) headers.delete('Authorization');
    else if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(url, { ...options, headers, credentials: 'include' });
  };
  let response = await send(token);
  if (!anonymous && token && response.status === 401) {
    if (sessionVersion !== version || !tokens.get()) throw sessionChanged();
    if (options.signal?.aborted) throw new DOMException('요청이 취소됐어요.', 'AbortError');
    // A late 401 may arrive after another request already completed the refresh.
    const renewed = tokens.get() !== token ? tokens.get()! : await waitForRefresh(refresh(version), options.signal);
    if (sessionVersion !== version) throw sessionChanged();
    response = await send(renewed);
    if (sessionVersion !== version) throw sessionChanged();
    if (response.status === 401) {
      expire(version);
      throw sessionExpired();
    }
  }
  if (!anonymous && token && sessionVersion !== version) throw sessionChanged();
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!anonymous && token && sessionVersion !== version) throw sessionChanged();
  if (!response.ok) throw new ApiError(body?.error?.message ?? body?.message ?? '요청을 처리하지 못했어요.', response.status, body?.error?.code ?? null);
  return body as T;
}
