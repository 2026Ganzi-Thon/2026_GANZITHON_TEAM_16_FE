import { useEffect, useRef, type CSSProperties } from 'react';
import type { Character } from '../features/characters/api';
import { characterCatalog } from '../features/characters/catalog';
import type { useCharacters } from '../features/characters/useCharacters';

function artwork(character: Character) {
  return characterCatalog.find(item => item.key === character.code.toLowerCase()) ?? characterCatalog[0];
}
function Portrait({ character }: { character: Character }) {
  const fallback = artwork(character).image;
  return <img src={character.imageUrl || fallback} alt="" onError={event => {
    const image = event.currentTarget;
    if (image.getAttribute('src') !== fallback) image.src = fallback;
  }} />;
}

interface Props {
  state: ReturnType<typeof useCharacters>;
  showDetail: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
}

export default function CharacterScreen({ state, showDetail, onBack, onOpen }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    if (!showDetail) return;
    const previous = document.activeElement;
    close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back.current();
      if (event.key === 'Tab') {
        const controls = [...(close.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => { window.removeEventListener('keydown', keyboard); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [showDetail]);

  function cards(owned: boolean) {
    const entries = state.items.filter(item => item.isOwned === owned);
    if (!entries.length) return <p className="character-empty">{owned ? '보유한 모우가 없어요.' : '추가 캐릭터가 없어요.'}</p>;
    return <div className="character-grid">{entries.map(character => <button key={character.id} type="button"
      className="character-card" aria-label={`${character.name} 상세보기`} onClick={() => onOpen(character.id)}
      style={{ '--character-tint': artwork(character).tint } as CSSProperties}>
      <Portrait character={character} /><strong>{character.name}</strong>
      <span>{state.selectedId === character.id ? '선택됨' : character.isOwned ? '보유중' : character.isPremium ? '프리미엄 · 미보유' : '미보유'}</span>
    </button>)}</div>;
  }
  const detail = state.detail;
  return <section className="character-screen" aria-label="My 캐릭터">
    <header className="character-header" inert={showDetail}><button type="button" aria-label="뒤로 가기" onClick={onBack}>‹</button><h1>My 캐릭터</h1></header>
    <div className="character-content" data-scroll-key="characters" aria-busy={state.loading} inert={showDetail}>
      <p className="character-intro">오늘의 마음을 함께할 모우를 만나보세요.</p>
      {state.loading ? <p role="status">캐릭터를 불러오는 중이에요.</p> : state.error ? <div role="alert"><p>{state.error}</p><button className="character-primary" onClick={state.retry}>다시 시도</button></div> : <>
        <h2>보유중인 모우</h2>{cards(true)}
        <h2>만나볼 모우</h2>{cards(false)}
      </>}
    </div>
    {showDetail && <div className="character-backdrop"><section className="character-dialog" role="dialog" aria-modal="true" aria-label="캐릭터 상세" aria-busy={state.detailLoading}>
      <button ref={close} className="character-close" type="button" aria-label="닫기" onClick={onBack}>×</button>
      {state.detailLoading ? <p role="status">상세 정보를 불러오는 중이에요.</p> : state.detailError ? <div role="alert"><p>{state.detailError}</p><button className="character-primary" onClick={state.retry}>다시 시도</button></div> : detail && <>
        <Portrait key={detail.id} character={detail} /><h2>{detail.name}</h2>
        <p className="character-description">{detail.description || '캐릭터 소개를 준비하고 있어요.'}</p>
        <p className="character-ownership">{detail.isOwned ? '보유중인 모우예요.' : '아직 보유하지 않은 모우예요.'}</p>
        <button type="button" className="character-primary" disabled={!detail.isOwned || state.loading || Boolean(state.error)}
          aria-pressed={state.selectedId === detail.id} onClick={() => state.select(detail)}>
          {!detail.isOwned ? '보유한 캐릭터만 선택할 수 있어요' : state.selectedId === detail.id ? '선택된 모우예요' : '이 모우 선택하기'}
        </button>
      </>}
    </section></div>}
  </section>;
}
