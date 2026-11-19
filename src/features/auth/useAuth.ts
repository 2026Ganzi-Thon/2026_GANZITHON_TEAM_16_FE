import { useEffect, useRef, useState } from 'react';
import { authApi, type LoginResponse } from './api';
import { ApiError, tokens } from '../../lib/http';
import { authorizationUrl, consumeAttempt, providerNames, type SocialProvider } from './oauth';

const callbackRequests = new Map<string, Promise<LoginResponse>>();
const loginError = (error: unknown) => {
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return '로그인 서버의 응답이 늦어졌어요. 로그인 버튼부터 다시 시도해 주세요.';
  if (error instanceof TypeError) return '로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (error instanceof ApiError && error.status === 404) return '이 로그인 방법을 지금 사용할 수 없어요. 잠시 후 다시 시도해 주세요.';
  return error instanceof Error ? error.message : '로그인 요청을 완료하지 못했어요.';
};

interface AuthCallbacks {
  onAuthenticated: () => void;
  onError: (message: string) => void;
  onSessionExpired?: () => void;
}

export function useAuth(callbacks: AuthCallbacks) {
  const latest = useRef(callbacks);
  const generation = useRef(0);
  const processing = useRef(false);
  const [authenticating, setAuthenticating] = useState(false);
  latest.current = callbacks;

  useEffect(() => {
    const expired = () => latest.current.onSessionExpired?.();
    const changed = () => { generation.current++; };
    window.addEventListener('mowoo:auth-expired', expired);
    window.addEventListener('mowoo:auth-change', changed);
    return () => { window.removeEventListener('mowoo:auth-expired', expired); window.removeEventListener('mowoo:auth-change', changed); };
  }, []);

  useEffect(() => {
    const match = location.pathname.match(/^\/login\/oauth2\/code\/(kakao|google|naver)$/);
    if (!match) return;
    const provider = match[1] as SocialProvider;
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');
    const key = JSON.stringify([provider, code, state]);
    const fail = (message: string) => {
      // Remove one-time codes/state from the address before showing the login screen.
      history.replaceState(history.state, '', '/');
      latest.current.onError(message);
    };
    let pending = callbackRequests.get(key);
    try {
      if (!pending) {
        if (params.getAll('state').length !== 1 || params.getAll('code').length > 1 || params.getAll('error').length > 1) throw new Error('로그인 응답을 확인하지 못했어요. 다시 로그인해 주세요.');
        consumeAttempt(provider, state);
        if (params.has('error')) throw new Error(params.get('error') === 'access_denied' ? `${providerNames[provider]} 로그인을 취소했어요.` : `${providerNames[provider]} 로그인을 완료하지 못했어요. 다시 시도해 주세요.`);
        if (!code?.trim()) throw new Error(`${providerNames[provider]} 인가 코드가 없어요. 다시 로그인해 주세요.`);
        pending = authApi.socialLogin(provider, code, state!);
        callbackRequests.set(key, pending);
        // Keep only in-flight requests, never reusable successful tokens or codes.
        void pending.then(() => callbackRequests.delete(key), () => callbackRequests.delete(key));
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : '로그인을 시작하지 못했어요. 다시 시도해 주세요.');
      return;
    }
    processing.current = true; setAuthenticating(true);
    const version = generation.current;
    let active = true;
    pending.then(response => {
      if (!active || version !== generation.current) return;
      if (typeof response?.accessToken !== 'string' || !response.accessToken.trim()) throw new Error('로그인 응답을 확인하지 못했어요. 다시 로그인해 주세요.');
      tokens.set(response.accessToken);
      latest.current.onAuthenticated();
    }).catch(error => { if (active && version === generation.current) fail(loginError(error)); })
      .finally(() => {
        if (active) {
          if (location.pathname === `/login/oauth2/code/${provider}`) history.replaceState(history.state, '', '/');
          processing.current = false; setAuthenticating(false);
        }
      });
    return () => { active = false; };
  }, []);

  function startLogin(provider: SocialProvider = 'kakao') {
    if (processing.current) return;
    try { location.assign(authorizationUrl(provider)); }
    catch (error) { latest.current.onError(error instanceof Error ? error.message : '로그인을 시작하지 못했어요.'); }
  }

  async function logout() {
    if (tokens.get()) await authApi.logout();
    tokens.clear();
  }

  return { startLogin, logout, authenticating };
}
