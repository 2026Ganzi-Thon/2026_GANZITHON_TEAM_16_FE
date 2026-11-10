import { request } from '../../lib/http';
import type { Profile } from '../../types/profile';

export const profileApi = {
  get: () => request<Profile>('/api/v1/me'),
  update: (changes: Partial<Profile>) => request<Profile>('/api/v1/me', {
    method: 'PATCH', body: JSON.stringify(changes),
  }),
};
