import { Children, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { screens, type ScreenName } from './design/screens';
import type { Profile } from './types/profile';
import { useProfile } from './hooks/useProfile';
import { useAuth } from './features/auth/useAuth';
import { initializeNavigation, navigate, rememberPosition, restorePosition, returnToPrevious } from './navigation';
import { useChat } from './features/chat/useChat';
import { REQUIRED_TURNS } from './features/chat/types';
import ChatThread from './components/ChatThread';
import ArchiveList from './components/ArchiveList';
import BirthDateField from './components/BirthDateField';
import { characterCardNodes, characterCatalog, findCharacter } from './features/characters/catalog';
import { useCharacters } from './features/characters/useCharacters';
import CharacterScreen from './components/CharacterScreen';
import { LiveCalendar, LiveDeleteList, LiveDiaryList } from './components/DiaryViews';
import { diaryApi, todaySeoul, type Diary } from './features/diary/api';
import { tokens } from './lib/http';

// Static sample nodes replaced by live layers.
const hiddenNodes: Partial<Record<ScreenName, Set<string>>> = {
  Chat: new Set(['17:244', '30:3565', '30:3571', '17:292', '17:298']),
  Archive: new Set(['155:1391', '155:1402', '155:1403']),
  // Keep two sample records until the record list/delete API exists.
  DeleteSelected: new Set(['113:1008', '113:1022', '113:966']), // 113:966: drawn scrollbar
};
const progressModalNodes = ['130:563', '130:653'];
// Mind calendar (design month: June 2026): day cell node -> day of month.
const calendarYear = 2026, calendarMonth = 6;
const calendarCells: Record<string, number> = {
  '26:2947':1,'26:2949':2,'26:2951':3,'26:2953':4,
  '26:2971':5,'26:2973':6,'26:2975':7,'26:2977':8,'26:2979':9,'26:2981':10,'26:2983':11,
  '26:2956':12,'26:2958':13,'26:2960':14,'26:2962':15,'26:2964':16,'26:2966':17,'26:2968':18,
  '26:2926':19,'26:2928':20,'26:2930':21,'26:2932':22,'26:2934':23,'26:2936':24,'26:2938':25,
  '26:2911':26,'26:2913':27,'26:2915':28,'26:2917':29,'26:2919':30,'26:2921':31,
};
// Days drawn with a mood badge in the design; replace with the calendar API's record dates.
const calendarRecordDays = new Set([1, 5, 6]);
const isoDate = (day: number) => `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const diaryDateParam = () => {
  const value = new URLSearchParams(location.search).get('date');
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
};
/** "2026-06-05" -> "2026년 6월 5일 금요일 기록", read as a calendar date (no UTC shift). */
const diaryDateLabelFor = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return `${new Date(y, m - 1, d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 기록`;
};
const sessionParam = () => new URLSearchParams(location.search).get('session');
const diaryIdParam = () => new URLSearchParams(location.search).get('id');
// Logged-in screens replace these Figma sample nodes with server data.
const liveHiddenNodes: Partial<Record<ScreenName, Set<string>>> = {
  Diary: new Set(['155:225']),
  Calendar: new Set(['26:2814', '155:1164']),
  DeleteSelected: new Set(['113:993', '113:994']),
};
const characterParam = () => new URLSearchParams(location.search).get('character');

const paths: Record<string, ScreenName> = {
  '/': 'Login', '/home': 'Home', '/mypage': 'MyPage', '/me': 'Profile', '/me/edit': 'EditProfile',
  '/characters': 'Characters', '/characters/detail': 'CharacterDetail', '/chat': 'Chat', '/chat/ready': 'Chat',
  '/chat/progress': 'Chat', '/diary': 'Diary', '/diary/new': 'DiaryChoice', '/diary/write': 'DiaryEditor',
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
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight });
  const { profile, saveProfile: persistProfile, error: profileError } = useProfile();
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile]);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [viewSession, setViewSession] = useState<string | null>(sessionParam);
  const [showProgress, setShowProgress] = useState(false);
  const chat = useChat(screen === 'Chat', viewSession, setNotice);
  // Logged in -> real API; logged out -> local preview data.
  const [live, setLive] = useState(() => Boolean(tokens.get()));
  useEffect(() => {
    const changed = () => setLive(Boolean(tokens.get()));
    addEventListener('mowoo:auth-change', changed);
    return () => removeEventListener('mowoo:auth-change', changed);
  }, []);
  const [diaryId, setDiaryId] = useState<string | null>(diaryIdParam);
  const [liveDiary, setLiveDiary] = useState<Diary | null>(null);
  const [editor, setEditor] = useState({ title: '', content: '' });
  const [busy, setBusy] = useState(false);
  const [selectedDiaries, setSelectedDiaries] = useState<Set<string>>(new Set());
  useEffect(() => { if (profileError) setNotice(profileError); }, [profileError]);
  const [selected, setSelected] = useState<Set<string>>(new Set(['113:984']));
  const [savingSetting, setSavingSetting] = useState<string | null>(null);
  const settingPending = useRef(false);
  const [diaryText, setDiaryText] = useState(() => localStorage.getItem('mowoo.diary') ?? '');
  const [attachment, setAttachment] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const previewOnly = location.pathname.startsWith('/design/');
  const characterState = useCharacters(!previewOnly && (screen === 'Characters' || screen === 'CharacterDetail'), screen === 'CharacterDetail' ? characterParam() ?? 'kind' : null);
  const { startLogin, logout } = useAuth({
    onAuthenticated: () => { navigate('/home', true); setScreen('Home'); },
    onError: setNotice,
  });

  const go = (next: ScreenName, replace = false) => {
    const path = Object.entries(paths).find(([, value]) => value === next)?.[0] ?? `/design/${next}`;
    if (location.pathname === path && !replace) return;
    navigate(path, replace); setScreen(next); setNotice(''); setViewSession(null); setShowProgress(false); setDiaryId(null);
    if (next === 'EditProfile') setDraft(profile);
  };
  const openSession = (id: string) => {
    navigate(`/chat?session=${encodeURIComponent(id)}`); setViewSession(id); setScreen('Chat'); setNotice(''); setShowProgress(false);
  };
  const openDiaryDate = (date: string) => {
    navigate(`/diary/detail?date=${date}`); setScreen('DiaryDetail'); setNotice(''); setViewSession(null); setShowProgress(false);
  };
  const openDiary = (id: string, write = false, replace = false) => {
    navigate(`/diary/${write ? 'write' : 'detail'}?id=${encodeURIComponent(id)}`, replace);
    setDiaryId(id); setScreen(write ? 'DiaryEditor' : 'DiaryDetail'); setNotice(''); setViewSession(null); setShowProgress(false);
  };
  async function saveLiveDiary() {
    const title = editor.title.trim(), content = editor.content.trim();
    if (!title) { setNotice('제목을 입력해 주세요.'); return; }
    if (!content) { setNotice('일기 내용을 입력해 주세요.'); return; }
    if (busy) return;
    setBusy(true);
    try {
      const saved = diaryId
        ? await diaryApi.update(diaryId, { title, content, save: true })
        : await diaryApi.create({ entryDate: todaySeoul(), title, content });
      navigate(`/diary/saved?id=${encodeURIComponent(saved.id)}`, true); setDiaryId(saved.id); setScreen('DiarySaved');
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function runLive(task: () => Promise<unknown>, next: ScreenName) {
    if (busy) return;
    setBusy(true);
    try { await task(); go(next); } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }
  async function withdraw() {
    if (!live) { setNotice('로그인한 계정에서만 탈퇴할 수 있어요.'); return; }
    if (!confirm('계정을 삭제할까요? 모든 대화와 일기가 지워지고 되돌릴 수 없어요.')) return;
    try { await diaryApi.withdraw(); tokens.clear(); go('Login', true); } catch (error) { setNotice((error as Error).message); }
  }
  async function sendMessage() {
    const text = message.trim();
    if (!text || chat.pending || chat.closed) return;
    setMessage('');
    if (!(await chat.send(text))) setMessage(text);
  }
  async function generateDiary() {
    if (chat.closed || chat.pending) return;
    if (!chat.canGenerate) { setShowProgress(true); return; }
    const finished = await chat.finish();
    if (!finished) return;
    if (live) {
      // Server AI draft (returns the existing diary if this chat already has one).
      try { openDiary((await diaryApi.draftFromChat(finished.sessionId, todaySeoul())).id, true); }
      catch (error) { setNotice((error as Error).message); }
      return;
    }
    // Preview: a local draft from the user's own words in this chat.
    setDiaryText(finished.lines.join('\n'));
    go('DiaryEditor');
  }
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
    const resize = () => setViewport({ width: innerWidth, height: innerHeight });
    const pop = () => { setScreen(getScreen()); setViewSession(sessionParam()); setDiaryId(diaryIdParam()); setShowProgress(false); setNotice(''); };
    addEventListener('resize', resize); addEventListener('popstate', pop);
    addEventListener('pagehide', rememberPosition);
    return () => { removeEventListener('resize', resize); removeEventListener('popstate', pop); removeEventListener('pagehide', rememberPosition); history.scrollRestoration = previousRestoration; };
  }, []);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => {
    if (screen !== 'DiarySaved') return;
    const timer = setTimeout(() => (live && diaryId ? openDiary(diaryId, false, true) : go('DiaryDetail', true)), 1800);
    return () => clearTimeout(timer);
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps
  // Load the diary for the editor/detail; detail without an id shows the latest diary.
  useEffect(() => {
    if (!live || (screen !== 'DiaryEditor' && screen !== 'DiaryDetail')) { setLiveDiary(null); return; }
    let active = true;
    setLiveDiary(null);
    if (!diaryId) {
      setEditor({ title: '', content: '' });
      if (screen === 'DiaryDetail') diaryApi.list({ limit: 1 }).then(page => {
        if (!active) return;
        if (page.items[0]) openDiary(page.items[0].id, false, true); else setNotice('아직 저장한 일기가 없어요.');
      }).catch(error => active && setNotice(error.message));
      return;
    }
    diaryApi.get(diaryId).then(diary => {
      if (!active) return;
      setLiveDiary(diary); setEditor({ title: diary.title, content: diary.content });
    }).catch(error => active && setNotice(error.message));
    return () => { active = false; };
  }, [live, screen, diaryId]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const actions: Record<string, [string, () => void]> = {};
  const link = (ids: string[], label: string, next: ScreenName) => ids.forEach(id => { actions[id] = [label, () => go(next)]; });
  if (screen === 'Login') {
    // Without a Kakao key (.env.local) every login button opens the local preview,
    // so all screens can be checked before the auth backend is set up.
    const kakaoConfigured = Boolean(import.meta.env.VITE_KAKAO_CLIENT_ID);
    const enterPreview = () => { go('Home', true); setNotice('로그인 없이 미리보기로 들어왔어요. 데이터는 이 브라우저에만 저장돼요.'); };
    actions['91:79'] = ['카카오 로그인', kakaoConfigured ? startLogin : enterPreview];
    actions['227:217'] = ['구글 로그인', kakaoConfigured ? () => setNotice('구글 로그인은 아직 연결되지 않았어요.') : enterPreview];
    actions['91:69'] = ['네이버 로그인', kakaoConfigured ? () => setNotice('네이버 로그인은 아직 연결되지 않았어요.') : enterPreview];
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
    actions['130:779'] = ['로그아웃', () => { void logout().then(() => go('Login')).catch(error => setNotice(error.message)); }];
    ['130:786','130:787','130:789'].forEach(id => { actions[id] = ['메뉴 안내', () => setNotice('이 메뉴는 아직 연결되지 않았어요.')]; });
    actions['130:780'] = ['계정 삭제', () => { void withdraw(); }];
  }
  if (screen === 'EditProfile') actions['130:844'] = ['저장하기', () => { void submitProfile(); }];
  if (screen === 'Characters') characterCatalog.forEach(character => {
    actions[characterCardNodes[character.key]] = [`${character.name} 상세보기`, () => {
      navigate(`/characters/detail?character=${character.key}`); setScreen('CharacterDetail'); setNotice('');
    }];
  });
  if (screen === 'CharacterDetail') actions['120:394'] = ['닫기', back];
  if (screen === 'Diary') {
    link(['28:3046','28:3210'], '오늘을 기록하러 가기', 'DiaryChoice');
    link(['28:3054','155:214'], '지난 일기 보기', 'DiaryDetail'); link(['28:3187','28:3211','155:143'], '마음 캘린더', 'Calendar');
  }
  if (screen === 'DiaryChoice') { link(['33:3928'], '모우와 대화하고 자동 기록하기', 'Chat'); link(['33:3927'], '직접 작성하기', 'DiaryEditor'); actions['227:138'] = ['닫기', back]; }
  if (screen === 'DiaryEditor') actions['155:606'] = ['일기 저장', live ? () => { void saveLiveDiary(); } : () => { if (diaryText) localStorage.setItem('mowoo.diary', diaryText); go('DiarySaved'); }];
  if (screen === 'DiaryDetail') actions['113:2810'] = ['수정하기', live && liveDiary ? () => openDiary(liveDiary.id, true) : () => go('DiaryEditor')];
  if (screen === 'Calendar') {
    link(['155:1138'], '일기 보기', 'DiaryDetail');
    if (!live) Object.entries(calendarCells).forEach(([id, day]) => {
      actions[id] = calendarRecordDays.has(day)
        ? [`${calendarMonth}월 ${day}일 기록 보기`, () => openDiaryDate(isoDate(day))]
        : [`${calendarMonth}월 ${day}일`, () => setNotice(`${calendarMonth}월 ${day}일에는 남긴 기록이 없어요.`)];
    });
  }
  if (screen === 'Chat') {
    actions['30:3559'] = ['오늘 대화로 일기 자동 생성', () => { void generateDiary(); }];
    actions['97:52'] = ['메시지 보내기', () => { void sendMessage(); }];
    actions['130:598'] = ['이어서 대화하기', () => setShowProgress(false)];
    actions['130:563'] = ['안내 닫기', () => setShowProgress(false)];
  }
  if (screen === 'DeleteAll') {
    actions['113:2992'] = ['취소', back];
    actions['113:2991'] = ['모든 기록 삭제하기', live ? () => { void runLive(() => diaryApi.deleteAllRecords(), 'Deleted'); } : () => go('Deleted')];
  }
  if (screen === 'DeleteSelected') {
    actions['113:1363'] = ['취소', back];
    actions['113:1362'] = ['선택된 기록 삭제하기', live
      ? () => { if (!selectedDiaries.size) { setNotice('삭제할 기록을 선택해 주세요.'); return; } void runLive(() => diaryApi.deleteDiaries([...selectedDiaries]).then(() => setSelectedDiaries(new Set())), 'Deleted'); }
      : () => { if (selected.size) go('Deleted'); }];
  }
  if (screen === 'Deleted') actions['120:396'] = ['닫기', () => go('MyPage', true)];

  function enhance(node: ReactNode): ReactNode {
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<NodeProps>, props = element.props, id = props['data-node-id'] ?? '', name = props['data-name'] ?? '';
    if (!previewOnly && (hiddenNodes[screen]?.has(id) || (live && liveHiddenNodes[screen]?.has(id)))) return null;
    let children = Children.map(props.children, enhance);
    const extra: NodeProps = {};
    let action = actions[id];
    if (name === 'tabler:chevron-left') action = ['뒤로 가기', back];
    if (['120:460','113:2809','33:3939'].includes(id)) Object.assign(extra, { 'data-scroll-key':id, tabIndex:0, role:'region', 'aria-label':id === '120:460' ? '캐릭터 설명' : '일기 본문' });
    if (['Diary','Calendar','Archive'].includes(screen) && id === screens[screen].nodeId) extra['data-scroll-key'] = screen;
    if (name === 'tabler:photo' && screen === 'DiaryEditor') action = ['사진 첨부', () => fileInput.current?.click()];
    if (name === 'tabler:photo' && screen === 'Chat') action = ['사진 첨부', () => setNotice('대화에서는 아직 사진을 보낼 수 없어요.')];
    if (name === 'tabler:microphone') action = ['음성 입력', () => setNotice('음성 입력은 아직 연결되지 않았어요.')];
    if (action) { const [label, run] = action; Object.assign(extra, { role: 'button', tabIndex: 0, 'aria-label': label, className: `${props.className ?? ''} design-action`, onClick: (e: React.MouseEvent) => { e.stopPropagation(); run(); }, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); run(); } } }); }
    if (!previewOnly) {
      const texts: Record<string, string> = { '130:769': profile.nickname, '130:777': profile.email ?? '', '130:776': profile.birthDate ? new Date(`${profile.birthDate}T00:00:00`).toLocaleDateString('ko-KR', { year:'numeric',month:'long',day:'numeric' }) : '', '33:3972': profile.nickname };
      if (id in texts) { children = [texts[id]]; extra.title = texts[id]; }
      const fields: Record<string, [keyof Profile, string]> = { '130:846':['nickname','닉네임'], '130:847':['email','이메일'], '130:848':['birthDate','생년월일'] };
      if (screen === 'EditProfile' && fields[id]) {
        const [field,label] = fields[id];
        if (field === 'birthDate') return <BirthDateField key={id} nodeId={id} className={String(props.className ?? '')} label={label} value={String(draft.birthDate ?? '')} onChange={birthDate => setDraft({ ...draft, birthDate })} />;
        return <input key={id} data-node-id={id} className={`${props.className} profile-input`} aria-label={label} type={field === 'email' ? 'email' : 'text'} maxLength={field === 'nickname' ? 50 : 254} value={String(draft[field] ?? '')} onChange={e => setDraft({ ...draft, [field]: e.target.value })} />;
      }
      if (screen === 'MyPage' && ['97:91','97:92'].includes(id)) {
        const field = id === '97:91' ? 'usePastDiaries' : 'eveningReminderEnabled';
        return <button key={id} data-node-id={id} className={`${props.className} setting-switch ${profile[field] ? 'is-on' : ''}`} type="button" role="switch" aria-checked={profile[field]} aria-busy={savingSetting === field} disabled={savingSetting !== null} aria-label={field === 'usePastDiaries' ? '과거 일기를 대화에 사용' : '저녁 모우 알림'} onClick={() => { void toggleSetting(field); }}><span /></button>;
      }
      if (screen === 'Chat' && id === '17:374') children = [<input key="message" className="message-input" aria-label="메시지" maxLength={1000} disabled={chat.closed} placeholder={chat.closed ? '종료된 대화예요' : '모우에게 이야기해 보세요'} value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void sendMessage(); } }} />];
      if (screen === 'Chat' && id === '97:52' && (chat.closed || chat.pending || !message.trim())) extra['aria-disabled'] = true;
      if (screen === 'Chat' && id === '30:3559') {
        if (chat.closed || chat.loading) return null;
        if (chat.canGenerate) extra.className = `${extra.className ?? props.className ?? ''} is-ready`;
        else extra['aria-label'] = `오늘 대화로 일기 자동 생성 (대화 ${chat.turns}/${REQUIRED_TURNS}회)`;
      }
      if (screen === 'Chat' && id === '130:593') children = [`대화 진행도(${Math.min(chat.turns, REQUIRED_TURNS)}/${REQUIRED_TURNS})`];
      if (screen === 'DiaryEditor' && id === '33:3939') {
        if (live) {
          Object.assign(extra, { contentEditable: true, suppressContentEditableWarning: true, role:'textbox', 'aria-label':'일기 내용', 'aria-multiline':true, 'data-placeholder':'오늘 있었던 일과 마음을 적어 주세요.', key: `content-${liveDiary?.id ?? 'new'}`, onInput: (e: React.FormEvent<HTMLElement>) => { const content = e.currentTarget.innerText; setEditor(v => ({ ...v, content })); } });
          children = [liveDiary?.content ?? (diaryId ? '' : '')];
        } else {
          Object.assign(extra, { contentEditable: true, suppressContentEditableWarning: true, role:'textbox', 'aria-label':'일기 내용', 'aria-multiline':true, onBlur: (e: React.FocusEvent<HTMLElement>) => setDiaryText(e.currentTarget.textContent ?? '') });
          if (diaryText) children = [diaryText];
        }
      }
      if (live && screen === 'DiaryEditor' && id === '155:632') {
        Object.assign(extra, { contentEditable: true, suppressContentEditableWarning: true, role:'textbox', 'aria-label':'일기 제목', 'data-placeholder':'제목', key: `title-${liveDiary?.id ?? 'new'}`, className: `${extra.className ?? props.className ?? ''} diary-title-input diary-title-live`, onInput: (e: React.FormEvent<HTMLElement>) => { const title = e.currentTarget.innerText.replace(/\n/g, ' '); setEditor(v => ({ ...v, title })); }, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault(); } });
        children = [liveDiary?.title ?? ''];
      }
      if (live && (screen === 'DiaryEditor' && id === '33:3938' || screen === 'DiaryDetail' && id === '113:2808')) children = [diaryDateLabelFor(liveDiary?.entryDate ?? todaySeoul())];
      if (screen === 'DiaryDetail' && id === '113:2809') { if (live) children = [liveDiary?.content ?? '']; else if (diaryText) children = [diaryText]; }
      if (live && screen === 'DiaryDetail' && id === '113:2807') { children = [liveDiary?.title ?? '']; extra.className = `${props.className ?? ''} diary-title-live`; }
      if (live && screen === 'DiaryDetail' && id === '155:598') {
        const photo = liveDiary?.attachments.find(a => a.mimeType.startsWith('image/'));
        if (!photo) return null;
        children = Children.map(children, child => isValidElement<{ src?: string }>(child) && child.type === 'img' ? cloneElement(child, { src: photo.url }) : child);
      }
      if (live && (screen === 'Diary' || screen === 'Calendar') && id === screens[screen].nodeId) {
        children = [...(Children.toArray(children)), screen === 'Diary'
          ? <LiveDiaryList key="live-diaries" top={599} onOpen={diaryId => openDiary(diaryId)} />
          : <LiveCalendar key="live-calendar" onOpen={diaryId => openDiary(diaryId)} onNotice={setNotice} />];
      }
      if (screen === 'CharacterDetail') {
        const character = findCharacter(characterParam());
        if (id === '120:389') children = Children.map(children, child => isValidElement<{ src?: string }>(child) && child.type === 'img' ? cloneElement(child, { src: character.image }) : child);
        if (id === '120:390') { children = [character.name]; extra.style = { ...props.style, color: character.color }; }
        if (id === '120:460') children = [character.description];
        if (id === '120:332') extra.style = { ...props.style, '--to': character.tint } as CSSProperties;
      }
      if (!live && screen === 'DiaryDetail' && id === '113:2808') { const date = diaryDateParam(); if (date) children = [diaryDateLabelFor(date)]; }
      if (!live && screen === 'DeleteSelected' && name.startsWith('tabler:square-check')) {
        const checked = selected.has(id);
        const recordNumber = ['113:983','113:984','113:1018','113:1032'].indexOf(id) + 1;
        return <button key={id} data-node-id={id} className={`${props.className} record-checkbox`} type="button" role="checkbox" aria-label={`기록 ${recordNumber} 선택`} aria-checked={checked} onClick={e => { e.stopPropagation(); setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }}><img src={checked ? '/assets/5c577.svg' : '/assets/5f4ae.svg'} alt="" /></button>;
      }
    }
    return cloneElement(element, extra, children);
  }
  function progressModal() {
    const root = screens.ChatProgress.Component() as ReactElement<NodeProps>;
    const modal = Children.toArray(root.props.children).filter(child => isValidElement<NodeProps>(child) && progressModalNodes.includes(child.props['data-node-id'] ?? ''));
    return enhance(cloneElement(root, {}, modal));
  }
  const { Component, height } = screens[screen];
  // Single-page designs (login, modals, chat) shrink to fit a short window so their
  // bottom buttons stay visible; long scrolling pages (Home, MyPage) fit width only.
  const scale = Math.min(1, viewport.width / 393, height <= 900 ? viewport.height / height : 1);
  return <>
    <main className="screen-viewport" style={{width:393*scale,height:height*scale}}>
      <div ref={stage} className="screen-stage" style={{height,transform:`scale(${scale})`}}>
        {!previewOnly && characterState.authenticated && (screen === 'Characters' || screen === 'CharacterDetail')
          ? <CharacterScreen state={characterState} showDetail={screen === 'CharacterDetail'} onBack={back} onOpen={id => {
            navigate(`/characters/detail?character=${encodeURIComponent(id)}`); setScreen('CharacterDetail'); setNotice('');
          }} />
          : enhance(Component())}
        {!previewOnly && screen === 'Chat' && <ChatThread
          messages={chat.messages} pending={chat.pending} loading={chat.loading} closed={chat.closed}
          hasOlder={chat.hasOlder} editableId={chat.editableId} onLoadOlder={chat.loadOlder} onEdit={chat.edit}
          onCharacter={() => go('Characters')}
        />}
        {!previewOnly && screen === 'Chat' && showProgress && <div className="progress-layer" role="dialog" aria-modal="true" aria-label="대화 진행도">{progressModal()}</div>}
        {!previewOnly && screen === 'Archive' && <ArchiveList onOpen={openSession} onError={setNotice} />}
        {!previewOnly && live && screen === 'DeleteSelected' && <LiveDeleteList selected={selectedDiaries} onToggle={id => setSelectedDiaries(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />}
      </div>
    </main>
    <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => { const file=e.target.files?.[0]; if(file){setAttachment(URL.createObjectURL(file));setNotice('사진을 선택했어요. 업로드 API 연결은 아직 필요해요.');} }} />
    {notice && <div className="notice" role="status">{notice}</div>}
  </>;
}
