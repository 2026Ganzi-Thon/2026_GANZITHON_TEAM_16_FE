import { request } from '../../lib/http';
import type { SocialProvider } from './oauth';

export interface LoginResponse {
  accessToken: string;
  id?: string;
  username?: string;
  nickname?: string;
}

export const authApi = {
  login: (code: string) => request<LoginResponse>('/api/v1/auth/kakao', {
    method: 'POST', body: JSON.stringify({ code }), signal: AbortSignal.timeout(20000),
  }),
  socialLogin: (provider: SocialProvider, code: string, state: string) => request<LoginResponse>(`/api/v1/auth/${provider}`, {
    method: 'POST', body: JSON.stringify(provider === 'naver' ? { code, state } : { code }), signal: AbortSignal.timeout(20000),
  }),
  reissue: () => request<{ accessToken: string }>('/api/v1/auth/reissue', { method: 'POST' }),
  logout: () => request('/api/v1/auth/logout', { method: 'POST' }),
};
