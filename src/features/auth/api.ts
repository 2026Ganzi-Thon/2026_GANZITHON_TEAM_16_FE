import { request } from '../../lib/http';

export interface LoginResponse {
  accessToken: string;
  id?: string;
  username?: string;
}

export const authApi = {
  login: (code: string) => request<LoginResponse>('/api/v1/auth/kakao', {
    method: 'POST', body: JSON.stringify({ code }),
  }),
  reissue: () => request<{ accessToken: string }>('/api/v1/auth/reissue', { method: 'POST' }),
  logout: () => request('/api/v1/auth/logout', { method: 'POST' }),
};
