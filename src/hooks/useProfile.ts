import { useState } from 'react';
import type { Profile } from '../types/profile';

const previewKey = 'mowoo.previewProfile';
const defaultProfile: Profile = {
  nickname: '김유저', email: 'kimuser16@gmail.com', birthDate: '2004-02-27',
  usePastDiaries: true, eveningReminderEnabled: false,
};

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() => {
    try { return JSON.parse(localStorage.getItem(previewKey) ?? 'null') ?? defaultProfile; }
    catch { return defaultProfile; }
  });
  async function saveProfile(changes: Partial<Profile>): Promise<Profile> {
    const updated = { ...profile, ...changes };
    localStorage.setItem(previewKey, JSON.stringify(updated));
    setProfile(updated);
    return updated;
  }
  return { profile, saveProfile };
}
