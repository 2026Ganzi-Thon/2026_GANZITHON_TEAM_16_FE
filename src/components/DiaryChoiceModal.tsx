import { useEffect, useRef } from 'react';

export default function DiaryChoiceModal({ onClose, onChat, onWrite }: { onClose: () => void; onChat: () => void; onWrite: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close(); }, []);
  return <dialog ref={dialog} className="diary-choice-dialog" aria-label="일기 작성 방식 선택" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="diary-choice-rings" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
    <button type="button" className="diary-choice-close" aria-label="닫기" onClick={onClose}>×</button>
    <div className="diary-choice-options">
      <button type="button" onClick={onChat}><img src="/assets/98e08.svg" alt="" /><span>모우와 대화하고<br />자동 기록하기</span></button>
      <button type="button" onClick={onWrite}><img src="/assets/57647.svg" alt="" /><span>직접 작성하기</span></button>
    </div>
  </dialog>;
}
