import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { characterName, defaultCharacter } from '../features/chat/characters';
import type { ChatMessage } from '../features/chat/types';

interface Props {
  messages: ChatMessage[];
  pending: string | null;
  loading: boolean;
  closed: boolean;
  hasOlder: boolean;
  editableId: string | null;
  onLoadOlder: () => Promise<void>;
  onEdit: (messageId: string, content: string) => Promise<boolean>;
  onCharacter: () => void;
}

export default function ChatThread({ messages, pending, loading, closed, hasOlder, editableId, onLoadOlder, onEdit, onCharacter }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const keepFromBottom = useRef<number | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string; saving: boolean } | null>(null);

  // New messages scroll to the bottom; older pages keep the reader's position.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    if (keepFromBottom.current !== null) {
      node.scrollTop = node.scrollHeight - keepFromBottom.current;
      keepFromBottom.current = null;
    } else {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, pending]);
  useEffect(() => { if (editing && editing.id !== editableId) setEditing(null); }, [editableId, editing]);

  async function loadOlder() {
    const node = scroller.current;
    if (node) keepFromBottom.current = node.scrollHeight - node.scrollTop;
    await onLoadOlder();
  }
  async function saveEdit() {
    if (!editing || editing.saving || !editing.text.trim()) return;
    setEditing({ ...editing, saving: true });
    const ok = await onEdit(editing.id, editing.text);
    setEditing(ok ? null : { ...editing, saving: false });
  }

  const assistantHeader = (name: string) => (
    <div className="chat-assistant-head">
      <img src={defaultCharacter.image} alt="" className="chat-avatar" />
      <button type="button" className="chat-character" onClick={onCharacter}>
        {name}
        <img src="/assets/5baa7.svg" alt="" />
      </button>
    </div>
  );

  return (
    <div className="chat-thread" ref={scroller} data-scroll-key="chat-thread" role="log" aria-label="대화 내용" aria-busy={loading || pending !== null}>
      {hasOlder && <button type="button" className="chat-older" onClick={() => { void loadOlder(); }}>이전 대화 더 보기</button>}
      {!loading && messages.length === 0 && !pending && (
        <p className="chat-empty">{closed ? '대화 내용이 없어요.' : '모우에게 오늘 있었던 일을 편하게 들려주세요.'}</p>
      )}
      {messages.map(message => message.senderRole === 'USER' ? (
        <div key={message.id} className="chat-row chat-row-user">
          {editing?.id === message.id ? (
            <div className="chat-edit">
              <textarea
                aria-label="메시지 수정" value={editing.text} disabled={editing.saving} autoFocus rows={3} maxLength={1000}
                onChange={e => setEditing({ ...editing, text: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void saveEdit(); } if (e.key === 'Escape') setEditing(null); }}
              />
              <div className="chat-edit-actions">
                <button type="button" onClick={() => setEditing(null)} disabled={editing.saving}>취소</button>
                <button type="button" className="is-primary" onClick={() => { void saveEdit(); }} disabled={editing.saving || !editing.text.trim()}>
                  {editing.saving ? '수정 중…' : '수정 완료'}
                </button>
              </div>
            </div>
          ) : (
            <p className="chat-bubble-user">{message.content}</p>
          )}
          {message.id === editableId && editing?.id !== message.id && (
            <button type="button" className="chat-edit-link" onClick={() => setEditing({ id: message.id, text: message.content, saving: false })}>
              내용 수정<img src="/assets/6eaf6.svg" alt="" />
            </button>
          )}
        </div>
      ) : (
        <div key={message.id} className="chat-row">
          {assistantHeader(characterName(message.characterId))}
          <p className="chat-bubble-assistant">{message.content}</p>
        </div>
      ))}
      {pending && <>
        <div className="chat-row chat-row-user"><p className="chat-bubble-user is-pending">{pending}</p></div>
        <div className="chat-row">
          {assistantHeader(defaultCharacter.name)}
          <p className="chat-bubble-assistant chat-typing" aria-label="답변을 기다리는 중"><span /><span /><span /></p>
        </div>
      </>}
    </div>
  );
}
