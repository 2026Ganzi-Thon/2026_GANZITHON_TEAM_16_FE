import { useEffect, useRef } from 'react';
import { authApi, type LoginResponse } from './api';
import { tokens } from '../../lib/http';

const callbackRequests = new Map<string, Promise<LoginResponse>>();

interface AuthCallbacks {
  onAuthenticated: () => void;
  onError: (message: string) => void;
}

export function useAuth(callbacks: AuthCallbacks) {
  const latest = useRef(callbacks);
  latest.current = callbacks;

  useEffect(() => {
    if (location.pathname !== '/login/oauth2/code/kakao') return;
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (!code) {
      latest.current.onError(params.get('error_description') ?? '카카오 인가 코드가 없어요.');
      return;
    }
    let pending = callbackRequests.get(code);
    if (!pending) {
      pending = authApi.login(code);
      callbackRequests.set(code, pending);
    }
    let active = true;
    pending.then(response => {
      if (!active) return;
      tokens.set(response.accessToken);
      latest.current.onAuthenticated();
    }).catch(error => { if (active) latest.current.onError(error.message); });
    return () => { active = false; };
  }, []);

  function startLogin() {
    const id = import.meta.env.VITE_KAKAO_CLIENT_ID;
    if (!id) {
      latest.current.onError('카카오 로그인 설정이 필요해요.');
      return;
    }
    const redirect = import.meta.env.VITE_KAKAO_REDIRECT_URI || `${location.origin}/login/oauth2/code/kakao`;
    location.assign(`https://kauth.kakao.com/oauth/authorize?${new URLSearchParams({
      client_id: id, redirect_uri: redirect, response_type: 'code',
    })}`);
  }

  async function logout() {
    if (tokens.get()) await authApi.logout();
    tokens.clear();
  }

  return { startLogin, logout };
}
