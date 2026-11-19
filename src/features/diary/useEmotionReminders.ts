import { useEffect, useState } from 'react';

const key = (owner: string) => `mowoo.emotion-reconfirmation.${owner}`;
function read(owner?: string): string[] {
  if (!owner) return [];
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key(owner)) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(-100) : [];
  } catch { return []; }
}

/** Only IDs are kept, scoped to the profile owner and the current browser session. */
export function useEmotionReminders(owner?: string) {
  const [state, setState] = useState(() => ({ owner, ids: read(owner) }));
  useEffect(() => { setState({ owner, ids: read(owner) }); }, [owner]);
  function mark(id: string, required: boolean) {
    setState(current => {
      const previous = current.owner === owner ? current.ids : read(owner);
      const ids = [...previous.filter(value => value !== id), ...(required ? [id] : [])].slice(-100);
      if (owner) try { sessionStorage.setItem(key(owner), JSON.stringify(ids)); } catch { /* In-memory notice still works. */ }
      return { owner, ids };
    });
  }
  return { pending: (id: string) => state.owner === owner && state.ids.includes(id), mark };
}
