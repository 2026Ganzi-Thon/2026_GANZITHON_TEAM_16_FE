import { request } from '../../lib/http';

export interface Character {
  id: string;
  code: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isPremium: boolean;
  isOwned: boolean;
}

interface CharacterDetail extends Omit<Character, 'code'> {
  characterCode: string;
}

export const characterApi = {
  list: (signal?: AbortSignal) => request<{ items: Character[] }>('/api/v1/characters', { signal }),
  detail: async (id: string, signal?: AbortSignal): Promise<Character> => {
    const detail = await request<CharacterDetail>(`/api/v1/characters/${encodeURIComponent(id)}`, { signal });
    return { ...detail, code: detail.characterCode };
  },
};
