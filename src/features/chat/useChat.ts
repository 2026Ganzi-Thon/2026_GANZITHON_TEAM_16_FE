import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi } from './api';
import { defaultCharacter } from './characters';
import { ChatApiError, type ChatMessage, type ChatSession } from './types';

const activeKey = 'mowoo.chat.active';
const readActive = () => { try { return localStorage.getItem(activeKey); } catch { return null; } };
const writeActive = (id: string | null) => {
  try { if (id) localStorage.setItem(activeKey, id); else localStorage.removeItem(activeKey); } catch { /* ignore */ }
};

export const errorMessage = (error: unknown) =>
  error instanceof ChatApiError ? error.message : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

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

  useEffect(() => {
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
        if (!viewSessionId && error instanceof ChatApiError && error.code === 'SESSION_NOT_FOUND') writeActive(null);
        else onError(errorMessage(error));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, viewSessionId, onError]);

  const loadOlder = useCallback(async () => {
    if (!session || !nextCursor || busy.current) return;
    busy.current = true;
    try {
      const detail = await chatApi.getSession(session.id, { cursor: nextCursor });
      setMessages(current => merge(current, detail.messages.items));
      setNextCursor(detail.messages.nextCursor);
    } catch (error) { onError(errorMessage(error)); }
    finally { busy.current = false; }
  }, [session, nextCursor, onError]);

  /** Resolves true when the message was accepted, so the caller can clear its input. */
  const send = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text || busy.current || session?.endedAt) return false;
    busy.current = true;
    setPending(text);
    try {
      let current = session;
      if (!current) {
        current = await chatApi.createSession({ characterId: defaultCharacter.id });
        writeActive(current.id);
        setSession(current);
      }
      const result = await chatApi.sendMessage(current.id, { content: text });
      setMessages(list => merge(list, [result.userMessage, result.assistantMessage]));
      setSession({ ...current, completedTurns: result.completedTurns, canGenerateDiary: result.canGenerateDiary });
      return true;
    } catch (error) {
      onError(errorMessage(error));
      return false;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }, [session, onError]);

  const edit = useCallback(async (messageId: string, content: string) => {
    if (!session || busy.current) return false;
    busy.current = true;
    try {
      const result = await chatApi.editMessage(session.id, messageId, { content });
      setMessages(list => merge(list, [result.userMessage, result.assistantMessage]));
      return true;
    } catch (error) {
      onError(errorMessage(error));
      return false;
    } finally { busy.current = false; }
  }, [session, onError]);

  /** Ends the session and returns the user's side of the conversation for a diary draft. */
  const finish = useCallback(async () => {
    if (!session || busy.current) return null;
    busy.current = true;
    try {
      const ended = await chatApi.endSession(session.id);
      writeActive(null);
      setSession(ended);
      return messages.filter(m => m.senderRole === 'USER').map(m => m.content);
    } catch (error) {
      onError(errorMessage(error));
      return null;
    } finally { busy.current = false; }
  }, [session, messages, onError]);

  const lastUser = [...messages].reverse().find(m => m.senderRole === 'USER');
  const editableId = !session?.endedAt && lastUser && messages.at(-1)?.senderRole === 'ASSISTANT' ? lastUser.id : null;

  return {
    session, messages, loading, pending, hasOlder: nextCursor !== null,
    turns: session?.completedTurns ?? 0,
    canGenerate: session?.canGenerateDiary ?? false,
    closed: Boolean(session?.endedAt),
    editableId, send, edit, finish, loadOlder,
  };
}
