import { useCallback, useEffect, useState } from 'react';
import { tokens } from '../../lib/http';
import { characterApi, type Character } from './api';

const selectionKey = 'mowoo.selectedCharacter';
// The subject scopes a UI preference only; authorization is always checked by the server.
function subject(token: string | null): string | null {
  try {
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch { return null; }
}

export function useCharacters(enabled: boolean, detailKey: string | null) {
  const [token, setToken] = useState(tokens.get);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<Character[]>([]);
  const [detail, setDetail] = useState<Character | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled && Boolean(token));
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const owner = subject(token);

  useEffect(() => {
    const changed = () => {
      setToken(tokens.get());
      setItems([]); setDetail(null); setSelectedId(null);
      setError(''); setDetailError('');
      try { sessionStorage.removeItem(selectionKey); } catch { /* optional preference */ }
      setRevision(value => value + 1);
    };
    window.addEventListener('mowoo:auth-change', changed);
    return () => window.removeEventListener('mowoo:auth-change', changed);
  }, []);

  useEffect(() => {
    if (!enabled || !token) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setItems([]);
    characterApi.list(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setItems(result.items);
      let stored: { owner?: string; id?: string } | null = null;
      try { stored = JSON.parse(sessionStorage.getItem(selectionKey) ?? 'null'); } catch { /* optional preference */ }
      const validId = owner && stored?.owner === owner && result.items.some(item => item.id === stored?.id && item.isOwned)
        ? stored.id! : null;
      setSelectedId(validId);
      if (!validId) try { sessionStorage.removeItem(selectionKey); } catch { /* optional preference */ }
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '캐릭터를 불러오지 못했어요.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [enabled, token, owner, revision]);

  const detailId = detailKey && (/^[0-9a-f-]{36}$/i.test(detailKey) ? detailKey : items.find(item => item.code.toLowerCase() === detailKey)?.id);
  const waitingForList = !detailId && loading;
  useEffect(() => {
    if (!enabled || !token || !detailKey) { setDetail(null); setDetailError(''); return; }
    // Old links using ?character=kind continue to work; new links use the server UUID.
    const id = detailId;
    setDetail(null); setDetailError('');
    if (!id) {
      setDetailLoading(waitingForList);
      if (!waitingForList) setDetailError('캐릭터를 찾을 수 없어요.');
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    characterApi.detail(id, controller.signal).then(result => {
      if (!controller.signal.aborted) setDetail(result);
    }).catch(reason => {
      if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : '상세 정보를 불러오지 못했어요.');
    }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [enabled, token, detailKey, detailId, waitingForList, revision]);

  const select = useCallback((character: Character) => {
    if (!character.isOwned || !items.some(item => item.id === character.id && item.isOwned)) return;
    setSelectedId(character.id);
    if (owner) try { sessionStorage.setItem(selectionKey, JSON.stringify({ owner, id: character.id })); } catch { /* selection still works in memory */ }
  }, [items, owner]);

  return { authenticated: Boolean(token), items, detail, selectedId, loading, detailLoading, error, detailError,
    select, retry: () => setRevision(value => value + 1) };
}
