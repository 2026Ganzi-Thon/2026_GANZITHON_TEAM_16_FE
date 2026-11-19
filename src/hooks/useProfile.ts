import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../types/profile';
import { profileApi } from '../features/profile/api';
import { tokens } from '../lib/http';

const previewKey = 'mowoo.previewProfile';
const defaultProfile: Profile = {
  nickname: '김유저', email: 'kimuser16@gmail.com', birthDate: '2004-02-27',
  usePastDiaries: true, eveningReminderEnabled: false,
};

function readPreviewProfile(): Profile {
  try { return JSON.parse(localStorage.getItem(previewKey) ?? 'null') ?? defaultProfile; }
  catch { return defaultProfile; }
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(readPreviewProfile);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      const current = ++generation.current;
      setError('');
      if (!tokens.get() || location.pathname.startsWith('/design/')) {
        setProfile(readPreviewProfile());
        return;
      }
      void profileApi.get().then(updated => {
        if (active && current === generation.current) setProfile(updated);
      }).catch(reason => {
        if (active && current === generation.current) setError(reason.message);
      });
    };
    window.addEventListener('mowoo:auth-change', refresh);
    refresh();
    return () => {
      active = false;
      generation.current++;
      window.removeEventListener('mowoo:auth-change', refresh);
    };
  }, []);

  async function saveProfile(changes: Partial<Profile>): Promise<Profile> {
    generation.current++;
    const updated = { ...profile, ...changes };
    setProfile(updated);
    try {
      if (!tokens.get()) {
        localStorage.setItem(previewKey, JSON.stringify(updated));
        return updated;
      }
      const saved = await profileApi.update(changes);
      setProfile(saved);
      return saved;
    } catch (reason) {
      setProfile(profile);
      throw reason;
    }
  }
  return { profile, saveProfile, error };
}
