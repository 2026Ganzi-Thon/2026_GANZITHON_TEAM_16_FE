import { Children, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { screens, type ScreenName } from './design/screens';
import type { Profile } from './types/profile';
import { useProfile } from './hooks/useProfile';
import { initializeNavigation, navigate, rememberPosition, restorePosition, returnToPrevious } from './navigation';

const paths: Record<string, ScreenName> = {
  '/': 'Login', '/home': 'Home', '/mypage': 'MyPage', '/me': 'Profile', '/me/edit': 'EditProfile',
  '/characters': 'Characters', '/characters/detail': 'CharacterDetail', '/chat': 'Chat', '/chat/ready': 'ChatReady',
  '/chat/progress': 'ChatProgress', '/diary': 'Diary', '/diary/new': 'DiaryChoice', '/diary/write': 'DiaryEditor',
  '/diary/saved': 'DiarySaved', '/diary/detail': 'DiaryDetail', '/calendar': 'Calendar', '/archive': 'Archive',
  '/records/delete-all': 'DeleteAll', '/records/select': 'DeleteSelected', '/records/deleted': 'Deleted',
};
type NodeProps = { children?: ReactNode; className?: string; style?: CSSProperties; 'data-node-id'?: string; 'data-name'?: string; [key: string]: unknown };

export default function App() {
  const getScreen = (): ScreenName => {
    const preview = location.pathname.match(/^\/design\/(\w+)$/)?.[1];
    return preview && preview in screens ? preview as ScreenName : paths[location.pathname] ?? 'Login';
  };
  const [screen, setScreen] = useState<ScreenName>(getScreen);
  const [scale, setScale] = useState(Math.min(1, innerWidth / 393));
  const { profile, saveProfile: persistProfile } = useProfile();
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile]);
  const [message, setMessage] = useState('');
  const [lastMessage, setLastMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(['113:984']));
  const [savingSetting, setSavingSetting] = useState<string | null>(null);
  const settingPending = useRef(false);
  const [diaryText, setDiaryText] = useState(() => localStorage.getItem('mowoo.diary') ?? '');
  const [attachment, setAttachment] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const previewOnly = location.pathname.startsWith('/design/');

  const go = (next: ScreenName, replace = false) => {
    const path = Object.entries(paths).find(([, value]) => value === next)?.[0] ?? `/design/${next}`;
    if (location.pathname === path && !replace) return;
    navigate(path, replace); setScreen(next); setNotice('');
    if (next === 'EditProfile') setDraft(profile);
  };
  const back = () => {
    if (returnToPrevious()) return;
    const fallback: Partial<Record<ScreenName, ScreenName>> = {
      Profile:'MyPage', EditProfile:'Profile', CharacterDetail:'Characters', DiaryDetail:'Diary',
      DiaryEditor:'Diary', DiaryChoice:'Diary', DiarySaved:'Diary', ChatProgress:'Chat',
      ChatReady:'Archive', DeleteAll:'MyPage', DeleteSelected:'MyPage', Deleted:'MyPage',
    };
    go(fallback[screen] ?? 'Home', true);
  };
  useLayoutEffect(() => { initializeNavigation(); restorePosition(); }, [screen]);
  useEffect(() => {
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const resize = () => setScale(Math.min(1, innerWidth / 393));
    const pop = () => { setScreen(getScreen()); setNotice(''); };
    addEventListener('resize', resize); addEventListener('popstate', pop);
    addEventListener('pagehide', rememberPosition);
    return () => { removeEventListener('resize', resize); removeEventListener('popstate', pop); removeEventListener('pagehide', rememberPosition); history.scrollRestoration = previousRestoration; };
  }, []);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { if (screen === 'DiarySaved') { const timer = setTimeout(() => go('DiaryDetail', true), 1800); return () => clearTimeout(timer); } }, [screen]);
  useEffect(() => () => { if (attachment) URL.revokeObjectURL(attachment); }, [attachment]);

  async function saveProfile(next: Partial<Profile>) {
    const updated = await persistProfile(next);
    setDraft(updated);
  }
  async function toggleSetting(field: 'usePastDiaries' | 'eveningReminderEnabled') {
    if (settingPending.current) return;
    settingPending.current = true;
    setSavingSetting(field);
    const previous = profile[field];
    try { await saveProfile({ [field]: !previous }); }
    catch (error) {
      setNotice((error as Error).message);
    } finally {
      settingPending.current = false;
      setSavingSetting(null);
    }
  }
  async function submitProfile() {
    if (!draft.nickname.trim()) { setNotice('닉네임을 입력해 주세요.'); return; }
    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) { setNotice('이메일 주소를 확인해 주세요.'); return; }
    try { await saveProfile({ nickname: draft.nickname, email: draft.email || null, birthDate: draft.birthDate || null }); back(); } catch (e) { setNotice((e as Error).message); }
  }
  function openPreview() {
    go('Home');
    setNotice('로그인 API가 연결되지 않은 UI 미리보기예요.');
  }
  const actions: Record<string, [string, () => void]> = {};
  const link = (ids: string[], label: string, next: ScreenName) => ids.forEach(id => { actions[id] = [label, () => go(next)]; });
  if (screen === 'Login') {
    actions['91:79'] = ['카카오 로그인', openPreview];
    actions['227:217'] = ['구글 로그인', () => setNotice('구글 로그인은 아직 연결되지 않았어요.')];
    actions['91:69'] = ['네이버 로그인', () => setNotice('네이버 로그인은 아직 연결되지 않았어요.')];
  }
  if (screen === 'Home') {
    link(['94:104'], '마이페이지', 'MyPage'); link(['10:530','10:518','10:480'], '대화 시작하기', 'Chat');
    link(['10:504'], '캐릭터 선택', 'Characters'); link(['17:17'], '오늘의 기록', 'Diary');
    link(['17:40','106:90','94:191'], '마음 캘린더', 'Calendar'); link(['17:48'], '대화 보관함', 'Archive');
    link(['106:84'], '지난 일기 보기', 'DiaryDetail');
  }
  if (screen === 'MyPage') {
    link(['97:80','33:3972','33:4039'], '내 정보', 'Profile');
    link(['33:4016','33:4017','33:3995','33:4005'], 'My 캐릭터', 'Characters');
    link(['33:4054'], '모든 기록 삭제', 'DeleteAll'); link(['33:4060'], '기록 선택 삭제', 'DeleteSelected');
  }
  if (screen === 'Profile') {
    link(['130:801'], '내 정보 수정', 'EditProfile');
    actions['130:779'] = ['로그아웃', () => go('Login')];
    ['130:780','130:786','130:787','130:789'].forEach(id => { actions[id] = ['메뉴 안내', () => setNotice('이 메뉴는 아직 연결되지 않았어요.')]; });
  }
  if (screen === 'EditProfile') actions['130:844'] = ['저장하기', () => { void submitProfile(); }];
  if (screen === 'Characters') link(['120:173','120:169','120:170','120:171','120:172'], '캐릭터 상세보기', 'CharacterDetail');
  if (screen === 'CharacterDetail') actions['120:394'] = ['닫기', back];
  if (screen === 'Diary') {
    link(['28:3046','28:3210'], '오늘을 기록하러 가기', 'DiaryChoice');
    link(['28:3054','155:214'], '지난 일기 보기', 'DiaryDetail'); link(['28:3187','28:3211','155:143'], '마음 캘린더', 'Calendar');
  }
  if (screen === 'DiaryChoice') { link(['33:3928'], '모우와 대화하고 자동 기록하기', 'Chat'); link(['33:3927'], '직접 작성하기', 'DiaryEditor'); actions['227:138'] = ['닫기', back]; }
  if (screen === 'DiaryEditor') actions['155:606'] = ['일기 저장', () => { if (diaryText) localStorage.setItem('mowoo.diary', diaryText); go('DiarySaved'); }];
  if (screen === 'DiaryDetail') link(['113:2810'], '수정하기', 'DiaryEditor');
  if (screen === 'Calendar') link(['155:1138'], '일기 보기', 'DiaryDetail');
  if (screen === 'Archive') link(['155:1303','155:1304','155:1305','155:1356','155:1357','155:1358','155:1366','155:1367'], '대화 보기', 'ChatReady');
  if (screen === 'Chat' || screen === 'ChatReady') {
    link(['17:294','94:368'], '캐릭터 선택', 'Characters'); link(['17:259','17:282','94:358','94:363'], '과거 일기 보기', 'DiaryDetail');
    link(['30:3559'], '대화 진행도 확인', 'ChatProgress'); link(['94:381'], '오늘 대화로 일기 자동 생성', 'DiaryEditor');
    actions[screen === 'Chat' ? '97:52' : '97:63'] = ['메시지 보내기', () => { if (message.trim()) { setLastMessage(message.trim()); setMessage(''); setNotice('메시지 입력을 확인했어요. 실제 AI 응답은 백엔드 연결이 필요해요.'); } }];
  }
  if (screen === 'ChatProgress') actions['130:598'] = ['이어서 대화하기', back];
  if (screen === 'DeleteAll') { actions['113:2992'] = ['취소', back]; link(['113:2991'], '모든 기록 삭제하기', 'Deleted'); }
  if (screen === 'DeleteSelected') { actions['113:1363'] = ['취소', back]; actions['113:1362'] = ['선택된 기록 삭제하기', () => { if (selected.size) go('Deleted'); }]; }
  if (screen === 'Deleted') actions['120:396'] = ['닫기', () => go('MyPage', true)];

  function enhance(node: ReactNode): ReactNode {
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<NodeProps>, props = element.props, id = props['data-node-id'] ?? '', name = props['data-name'] ?? '';
    let children = Children.map(props.children, enhance);
    const extra: NodeProps = {};
    let action = actions[id];
    if (name === 'tabler:chevron-left') action = ['뒤로 가기', back];
    if (['120:460','113:2809','33:3939'].includes(id)) Object.assign(extra, { 'data-scroll-key':id, tabIndex:0, role:'region', 'aria-label':id === '120:460' ? '캐릭터 설명' : '일기 본문' });
    if (['Diary','Calendar','Archive'].includes(screen) && id === screens[screen].nodeId) extra['data-scroll-key'] = screen;
    if (name === 'tabler:photo' && ['Chat','ChatReady','DiaryEditor'].includes(screen)) action = ['사진 첨부', () => fileInput.current?.click()];
    if (name === 'tabler:microphone') action = ['음성 입력', () => setNotice('음성 입력은 아직 연결되지 않았어요.')];
    if (action) { const [label, run] = action; Object.assign(extra, { role: 'button', tabIndex: 0, 'aria-label': label, className: `${props.className ?? ''} design-action`, onClick: (e: React.MouseEvent) => { e.stopPropagation(); run(); }, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); run(); } } }); }
    if (!previewOnly) {
      const texts: Record<string, string> = { '130:769': profile.nickname, '130:777': profile.email ?? '', '130:776': profile.birthDate ? new Date(`${profile.birthDate}T00:00:00`).toLocaleDateString('ko-KR', { year:'numeric',month:'long',day:'numeric' }) : '', '33:3972': profile.nickname };
      if (id in texts) { children = [texts[id]]; extra.title = texts[id]; }
      const fields: Record<string, [keyof Profile, string]> = { '130:846':['nickname','닉네임'], '130:847':['email','이메일'], '130:848':['birthDate','생년월일'] };
      if (screen === 'EditProfile' && fields[id]) {
        const [field,label] = fields[id];
        return <input key={id} data-node-id={id} className={`${props.className} profile-input`} aria-label={label} type={field === 'birthDate' ? 'date' : field === 'email' ? 'email' : 'text'} maxLength={field === 'nickname' ? 50 : 254} value={String(draft[field] ?? '')} onChange={e => setDraft({ ...draft, [field]: e.target.value })} />;
      }
      if (screen === 'MyPage' && ['97:91','97:92'].includes(id)) {
        const field = id === '97:91' ? 'usePastDiaries' : 'eveningReminderEnabled';
        return <button key={id} data-node-id={id} className={`${props.className} setting-switch ${profile[field] ? 'is-on' : ''}`} type="button" role="switch" aria-checked={profile[field]} aria-busy={savingSetting === field} disabled={savingSetting !== null} aria-label={field === 'usePastDiaries' ? '과거 일기를 대화에 사용' : '저녁 모우 알림'} onClick={() => { void toggleSetting(field); }}><span /></button>;
      }
      if (['17:374','97:61'].includes(id)) children = [<input key="message" className="message-input" aria-label="메시지" value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && message.trim()) { setLastMessage(message.trim()); setMessage(''); setNotice('실제 대화 전송은 백엔드 연결이 필요해요.'); } }} />];
      if (lastMessage && ['17:243','94:343'].includes(id)) children = [lastMessage];
      if (screen === 'DiaryEditor' && id === '33:3939') {
        Object.assign(extra, { contentEditable: true, suppressContentEditableWarning: true, role:'textbox', 'aria-label':'일기 내용', 'aria-multiline':true, onBlur: (e: React.FocusEvent<HTMLElement>) => setDiaryText(e.currentTarget.textContent ?? '') });
        if (diaryText) children = [diaryText];
      }
      if (screen === 'DiaryDetail' && id === '113:2809' && diaryText) children = [diaryText];
      if (screen === 'DeleteSelected' && name.startsWith('tabler:square-check')) {
        const checked = selected.has(id);
        const recordNumber = ['113:983','113:984','113:1018','113:1032'].indexOf(id) + 1;
        return <button key={id} data-node-id={id} className={`${props.className} record-checkbox`} type="button" role="checkbox" aria-label={`기록 ${recordNumber} 선택`} aria-checked={checked} onClick={e => { e.stopPropagation(); setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }}><img src={checked ? '/assets/5c577.svg' : '/assets/5f4ae.svg'} alt="" /></button>;
      }
    }
    return cloneElement(element, extra, children);
  }
  const { Component, height } = screens[screen];
  return <>
    <main className="screen-viewport" style={{width:393*scale,height:height*scale}}>
      <div ref={stage} className="screen-stage" style={{height,transform:`scale(${scale})`}}>{enhance(Component())}</div>
    </main>
    <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => { const file=e.target.files?.[0]; if(file){setAttachment(URL.createObjectURL(file));setNotice('사진을 선택했어요. 업로드 API 연결은 아직 필요해요.');} }} />
    {notice && <div className="notice" role="status">{notice}</div>}
  </>;
}
