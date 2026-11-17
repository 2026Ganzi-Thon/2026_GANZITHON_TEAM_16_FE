import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi, isLiveApi } from './api';
import { defaultCharacter, resolveLiveCharacterId } from './characters';
import { ChatApiError, type ChatMessage, type ChatSession } from './types';
import { tokens } from '../../lib/http';

// Separate slots so a preview session id is never sent to the server and vice versa.
const activeKey = () => (isLiveApi() ? 'mowoo.chat.active.live' : 'mowoo.chat.active');
const readActive = () => { try { return localStorage.getItem(activeKey()); } catch { return null; } };
const writeActive = (id: string | null) => {
  try { if (id) localStorage.setItem(activeKey(), id); else localStorage.removeItem(activeKey()); } catch { /* ignore */ }
};

export const errorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

/** Merge pages by id and keep server order. */
function merge(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map(m => [m.id, m]));
  incoming.forEach(m => byId.set(m.id, m));
  return [...byId.values()].sort((a, b) => a.sequenceNo - b.sequenceNo);
}

/**
 * Chat state for one session. With `viewSessionId` it opens that session (from the
 * archive); otherwise it resumes the active session and creates one on first send.
 * `enabled` reloads from storage each time the chat screen is entered.
 */
export function useChat(enabled: boolean, viewSessionId: string | null, onError: (message: string) => void) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  const [comparing, setComparing] = useState(false);
  const epoch = useRef(0);
  const [auth, setAuth] = useState(tokens.get);
  useEffect(() => {
    const changed = () => setAuth(tokens.get());
    window.addEventListener('mowoo:auth-change', changed);
    return () => window.removeEventListener('mowoo:auth-change', changed);
  }, []);

  useEffect(() => {
    epoch.current++;
    busy.current = false; setWorking(false); setComparing(false);
    let cancelled = false;
    const id = viewSessionId ?? readActive();
    setSession(null); setMessages([]); setNextCursor(null); setPending(null);
    if (!enabled || !id) { setLoading(false); return; }
    setLoading(true);
    chatApi.getSession(id)
      .then(detail => {
        if (cancelled) return;
        setSession(detail.session);
        setMessages(detail.messages.items);
        setNextCursor(detail.messages.nextCursor);
      })
      .catch(error => {
        if (cancelled) return;
        // A stale resumed session (deleted, another account) is dropped quietly.
        if (!viewSessionId && error instanceof ChatApiError && [400, 403, 404].includes(error.status)) writeActive(null);
        else onError(errorMessage(error));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; epoch.current++; };
  }, [enabled, viewSessionId, onError, auth]);

  const loadOlder = useCallback(async () => {
    if (!session || !nextCursor || busy.current) return;
    const version = epoch.current;
    busy.current = true; setWorking(true);
    try {
      const detail = await chatApi.getSession(session.id, { cursor: nextCursor });
      if (version !== epoch.current) return;
      setMessages(current => merge(current, detail.messages.items));
      setNextCursor(detail.messages.nextCursor);
    } catch (error) { if (version === epoch.current) onError(errorMessage(error)); }
    finally { if (version === epoch.current) { busy.current = false; setWorking(false); } }
  }, [session, nextCursor, onError]);

  /** Resolves true when the message was accepted, so the caller can clear its input. */
  const send = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text || loading || busy.current || session?.endedAt) return false;
    const version = epoch.current;
    busy.current = true; setWorking(true);
    setPending(text);
    try {
      let current = session;
      if (!current) {
        current = await chatApi.createSession({ characterId: isLiveApi() ? await resolveLiveCharacterId() : defaultCharacter.id });
        if (version !== epoch.current) return false;
        writeActive(current.id);
        setSession(current);
      }
      const result = await chatApi.sendMessage(current.id, { content: text });
      if (version !== epoch.current) return false;
      setMessages(list => merge(list, [result.userMessage, result.assistantMessage]));
      setSession({ ...current, completedTurns: result.completedTurns, canGenerateDiary: result.canGenerateDiary });
      return true;
    } catch (error) {
      if (version === epoch.current) onError(errorMessage(error));
      return false;
    } finally {
      if (version === epoch.current) { busy.current = false; setWorking(false); setPending(null); }
    }
  }, [session, loading, onError]);

  const edit = useCallback(async (messageId: string, content: string) => {
    if (!session || busy.current || session.endedAt) return false;
    const version = epoch.current;
    busy.current = true; setWorking(true);
    try {
      const result = await chatApi.editMessage(session.id, messageId, { content });
      if (version !== epoch.current) return false;
      setMessages(list => merge(list, [result.userMessage, result.assistantMessage]));
      return true;
    } catch (error) {
      if (version === epoch.current) onError(errorMessage(error));
      return false;
    } finally { if (version === epoch.current) { busy.current = false; setWorking(false); } }
  }, [session, onError]);

  /** Ends the session; returns its id and the user's lines (the preview's local diary draft). */
  const finish = useCallback(async () => {
    if (!session || busy.current) return null;
    const version = epoch.current;
    busy.current = true; setWorking(true);
    try {
      try {
        if (!session.endedAt) {
          const ended = await chatApi.endSession(session.id);
          if (version !== epoch.current) return null;
          setSession(ended);
        }
      } catch (error) {
        // Already ended elsewhere is fine; the draft can still be made.
        if (!(error instanceof ChatApiError && error.code === 'SESSION_CLOSED')) throw error;
      }
      if (version !== epoch.current) return null;
      writeActive(null);
      return { sessionId: session.id, lines: messages.filter(m => m.senderRole === 'USER').map(m => m.content) };
    } catch (error) {
      if (version === epoch.current) onError(errorMessage(error));
      return null;
    } finally { if (version === epoch.current) { busy.current = false; setWorking(false); } }
  }, [session, messages, onError]);

  const referenceDiary = useCallback(async (messageId: string, diaryId: string): Promise<string | null> => {
    if (!session || session.endedAt || busy.current) return '다른 요청을 처리 중이에요. 잠시 후 다시 시도해 주세요.';
    const version = epoch.current;
    busy.current = true; setWorking(true); setComparing(true);
    try {
      const result = await chatApi.referenceDiary(session.id, { messageId, diaryId });
      if (version !== epoch.current) return '대화가 변경되어 결과를 표시하지 않았어요.';
      // A comparison adds only an assistant message, never a completed turn.
      setMessages(list => merge(list, [result.assistantMessage]));
      return null;
    } catch (error) { return errorMessage(error); }
    finally { if (version === epoch.current) { busy.current = false; setWorking(false); setComparing(false); } }
  }, [session]);

  const lastUser = [...messages].reverse().find(m => m.senderRole === 'USER');
  const editableId = !session?.endedAt && lastUser && messages.at(-1)?.senderRole === 'ASSISTANT' ? lastUser.id : null;

  return {
    session, messages, loading, pending, working, comparing, referenceDiary, hasOlder: nextCursor !== null,
    turns: session?.completedTurns ?? 0,
    canGenerate: session?.canGenerateDiary ?? false,
    closed: Boolean(session?.endedAt),
    editableId, send, edit, finish, loadOlder,
  };
}
