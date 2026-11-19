import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { SelectedPhotos } from './Photos';
import '../mobile-chat.css';

interface Props {
  children: ReactNode; message: string; onMessage: (text: string) => void; onSend: () => void;
  closed: boolean; loading: boolean; working: boolean; generating: boolean; canGenerate: boolean; turns: number;
  photos: File[]; onRemovePhoto: (index: number) => void; onPhoto: () => void; onVoice: () => void;
  onBack: () => void; onHome: () => void; onGenerate: () => void;
}

export default function ChatLayout(props: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [viewport, setViewport] = useState(() => ({ height: window.visualViewport?.height ?? innerHeight, top: window.visualViewport?.offsetTop ?? 0 }));
  useLayoutEffect(() => {
    const update = () => {
      const visual = window.visualViewport;
      // Leave browser zoom accessible; keyboard resize must not scale the UI.
      if (visual && Math.abs(visual.scale - 1) > 0.05) return;
      setViewport({ height: visual?.height ?? innerHeight, top: visual?.offsetTop ?? 0 });
    };
    const previousScroll = { x: window.scrollX, y: window.scrollY };
    document.documentElement.classList.add('chat-page-locked');
    document.body.classList.add('chat-page-locked');
    window.scrollTo(0, 0);
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      document.documentElement.classList.remove('chat-page-locked');
      document.body.classList.remove('chat-page-locked');
      window.scrollTo(previousScroll.x, previousScroll.y);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${Math.max(44, Math.min(140, node.scrollHeight))}px`;
  }, [props.message]);
  return <main className="responsive-chat" style={{ height: viewport.height, top: viewport.top }}>
    <header className="responsive-chat-header">
      <button type="button" aria-label="뒤로 가기" onClick={props.onBack}><img src="/assets/504f3.svg" alt="" /></button>
      <button type="button" className="responsive-chat-logo" aria-label="홈으로 이동" onClick={props.onHome}><img src="/assets/c58d9.svg" alt="MOWOO" /><img className="responsive-chat-logo-mascot" src="/assets/ade05.png" alt="" /></button>
      <span className="responsive-chat-points"><img src="/assets/947a6.svg" alt="" />120</span>
    </header>
    <section className="responsive-chat-body" aria-label="모우와 대화">
      {props.children}
      {(!props.closed || props.canGenerate) && <div className="responsive-chat-draft"><button type="button" aria-label={`오늘 대화로 일기 자동 생성 (대화 ${props.turns}/5회)`} className={props.canGenerate ? 'is-ready' : ''} disabled={props.working || props.generating || props.loading} onClick={props.onGenerate}>
        {props.generating ? '일기를 생성하고 있어요…' : props.closed ? '대화로 만든 일기 생성·열기' : '오늘 대화로 일기 자동 생성'}
      </button></div>}
    </section>
    <footer className="responsive-chat-composer">
      {props.photos.length > 0 && <div className="responsive-chat-photos"><SelectedPhotos files={props.photos} disabled={props.working || props.generating} onRemove={props.onRemovePhoto} /></div>}
      <div className="responsive-chat-input-row">
        <button type="button" className="responsive-chat-photo" aria-label="사진 첨부" disabled={props.closed || props.working || props.generating || props.loading} onClick={props.onPhoto}><img src="/assets/16d5c.svg" alt="" /></button>
        <div className="responsive-chat-input-wrap">
          <textarea ref={input} rows={1} className="message-input" aria-label="메시지" maxLength={1000} disabled={props.closed}
            placeholder={props.closed ? '종료된 대화예요' : '모우에게 이야기해 보세요'} value={props.message} onChange={e => props.onMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); props.onSend(); } }} />
          <button type="button" className="responsive-chat-voice" aria-label="음성 입력" onClick={props.onVoice}><img src="/assets/2c5d7.svg" alt="" /></button>
        </div>
        <button type="button" className="responsive-chat-send" aria-label="메시지 보내기" disabled={props.closed || props.working || props.generating || props.loading || (!props.message.trim() && !props.photos.length)} onClick={props.onSend}><img src="/assets/547a2.svg" alt="" /></button>
      </div>
    </footer>
  </main>;
}
