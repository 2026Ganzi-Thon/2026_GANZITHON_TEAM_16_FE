import { Children, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { screens, type ScreenName } from './design/screens';
import type { Profile } from './types/profile';
import { useProfile } from './hooks/useProfile';
import { useAuth } from './features/auth/useAuth';
import { hasSocialConfiguration } from './features/auth/oauth';
import { initializeNavigation, navigate, rememberPosition, restorePosition, returnToPrevious } from './navigation';
import { useChat } from './features/chat/useChat';
import { REQUIRED_TURNS } from './features/chat/types';
import ChatThread from './components/ChatThread';
import ArchiveList from './components/ArchiveList';
import BirthDateField from './components/BirthDateField';
import { characterCardNodes, characterCatalog, findCharacter } from './features/characters/catalog';
import { useCharacters } from './features/characters/useCharacters';
import CharacterScreen from './components/CharacterScreen';
import { LiveCalendar, LiveDeleteList, LiveDiaryList, WeekList, WeekRow, useWeekDiaries } from './components/DiaryViews';
import { diaryApi, todaySeoul, type Diary } from './features/diary/api';
import { tokens } from './lib/http';
import { membership, useMyPageStats } from './features/profile/useMyPageStats';
import DiaryEmotions from './components/DiaryEmotions';
import { useEmotionReminders } from './features/diary/useEmotionReminders';

// Static sample nodes replaced by live layers.
const hiddenNodes: Partial<Record<ScreenName, Set<string>>> = {
  Chat: new Set(['17:244', '30:3565', '30:3571', '17:292', '17:298']),
  Archive: new Set(['155:1391', '155:1402', '155:1403']),
  // The design's fixed June 2026 grid and its sample list; LiveCalendar draws the real month.
  Calendar: new Set(['26:2814', '155:1164']),
  // Fixed sample week (5~11) on 오늘의 기록 and the home; WeekRow/WeekList draw this week.
  Diary: new Set(['155:143']),
  Home: new Set(['94:191', '106:84']),
  // Keep two sample records until the record list/delete API exists.
  DeleteSelected: new Set(['113:1008', '113:1022', '113:966']), // 113:966: drawn scrollbar
};
const progressModalNodes = ['130:563', '130:653'];
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
type DiaryFilter = { mode: 'month' | 'thisMonth' | 'thisWeek'; month: string };
const pad2 = (n: number) => String(n).padStart(2, '0');
/** Date range (Seoul calendar dates) for the 오늘의 기록 filter chips. */
function diaryRange(filter: DiaryFilter): { from: string; to: string } {
  const today = todaySeoul();
  if (filter.mode === 'thisMonth') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (filter.mode === 'thisWeek') {
    const [y, m, d] = today.split('-').map(Number);
    const start = new Date(y, m - 1, d - new Date(y, m - 1, d).getDay());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const iso = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    return { from: iso(start), to: iso(end) };
  }
  const [y, m] = filter.month.split('-').map(Number);
  return { from: `${filter.month}-01`, to: `${filter.month}-${pad2(new Date(y, m, 0).getDate())}` };
}
/** The current month and the 11 before it, newest first, as YYYY-MM. */
const recentMonths = () => {
  const [y, m] = todaySeoul().split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => { const d = new Date(y, m - 1 - i, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; });
};
// Logged-in screens replace these Figma sample nodes with server data.
const liveHiddenNodes: Partial<Record<ScreenName, Set<string>>> = {
  Diary: new Set(['155:225', '28:3210']),
  Calendar: new Set(['199:138']),
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
  const [draftGenerating, setDraftGenerating] = useState(false);
  const [draftError, setDraftError] = useState('');
  const draftOperation = useRef<AbortController | null>(null);
  // Logged in -> real API; logged out -> local preview data.
  const [live, setLive] = useState(() => Boolean(tokens.get()));
  useEffect(() => {
    draftOperation.current?.abort(); draftOperation.current = null;
    setDraftGenerating(false); setDraftError('');
    return () => draftOperation.current?.abort();
  }, [screen, viewSession, live]);
  const myPageStats = useMyPageStats(live && screen === 'MyPage' && !location.pathname.startsWith('/design/'));
  useEffect(() => {
    const changed = () => setLive(Boolean(tokens.get()));
    addEventListener('mowoo:auth-change', changed);
    return () => removeEventListener('mowoo:auth-change', changed);
  }, []);
  const [diaryId, setDiaryId] = useState<string | null>(diaryIdParam);
  const week = useWeekDiaries(screen === 'Home' || screen === 'Diary', live);
  const [liveDiary, setLiveDiary] = useState<Diary | null>(null);
  const [editor, setEditor] = useState({ title: '', content: '' });
  const emotionReminders = useEmotionReminders(live ? profile.id : undefined);
  const willResetEmotion = live && Boolean(liveDiary?.emotionConfirmedAt) && editor.content.trim() !== liveDiary?.content;
  const [busy, setBusy] = useState(false);
  const [selectedDiaries, setSelectedDiaries] = useState<Set<string>>(new Set());
  const [diaryFilter, setDiaryFilter] = useState<DiaryFilter>(() => ({ mode: 'month', month: todaySeoul().slice(0, 7) }));
  const [monthMenu, setMonthMenu] = useState(false);
  const chooseFilter = (next: DiaryFilter) => {
    setDiaryFilter(next); setMonthMenu(false);
    if (!live) setNotice('미리보기에서는 예시 기록만 보여요. 로그인하면 기간별로 볼 수 있어요.');
  };
  useEffect(() => { if (profileError) setNotice(profileError); }, [profileError]);
  const [selected, setSelected] = useState<Set<string>>(new Set(['113:984']));
  const [savingSetting, setSavingSetting] = useState<string | null>(null);
  const settingPending = useRef(false);
  const [diaryText, setDiaryText] = useState(() => localStorage.getItem('mowoo.diary') ?? '');
  const [attachment, setAttachment] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const previewOnly = location.pathname.startsWith('/design/');
  const characterState = useCharacters(!previewOnly && (screen === 'Home' || screen === 'Characters' || screen === 'CharacterDetail'), screen === 'CharacterDetail' ? characterParam() ?? 'kind' : null);
  const homeCharacter = characterState.items.find(item => item.id === characterState.selectedId && item.isOwned)
    ?? characterState.items.find(item => item.isOwned);
  const { startLogin, logout, authenticating } = useAuth({
    onSessionExpired: () => { navigate('/', true); setScreen('Login'); setNotice('로그인이 만료됐어요. 다시 로그인해 주세요.'); },
    onAuthenticated: () => { navigate('/home', true); setScreen('Home'); },
    onError: setNotice,
  });

  const go = (next: ScreenName, replace = false) => {
    const path = Object.entries(paths).find(([, value]) => value === next)?.[0] ?? `/design/${next}`;
    if (location.pathname === path && !replace) return;
    // Opening the calendar fresh starts at this month; only "back" returns to a remembered month.
    if (next === 'Calendar') { try { sessionStorage.removeItem('mowoo.calendarMonth'); } catch { /* ignore */ } }
    navigate(path, replace); setScreen(next); setNotice(''); setViewSession(null); setShowProgress(false); setDiaryId(null); setMonthMenu(false);
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
  const openWeekDiary = (diary: Diary) => (live ? openDiary(diary.id) : openDiaryDate(diary.entryDate));
  const emptyDay = (date: string) => setNotice(`${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일에는 남긴 기록이 없어요.`);
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
      if (liveDiary?.emotionConfirmedAt && content !== liveDiary.content && !saved.emotionConfirmedAt) emotionReminders.mark(saved.id, true);
      else if (saved.emotionConfirmedAt) emotionReminders.mark(saved.id, false);
      setLiveDiary(saved);
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
    if (!text || chat.working || draftGenerating || chat.closed) return;
    setMessage('');
    if (!(await chat.send(text))) setMessage(text);
  }
  async function generateDiary() {
    if (draftOperation.current || chat.working || chat.loading) return;
    if (!chat.canGenerate) { setShowProgress(true); return; }
    const operation = new AbortController(); draftOperation.current = operation;
    setDraftGenerating(true); setDraftError('');
    try {
      const finished = await chat.finish();
      if (!finished || operation.signal.aborted) return;
      if (live) {
        // Keep the ended session in the URL so refresh can resume a failed draft.
        navigate(`/chat?session=${encodeURIComponent(finished.sessionId)}`, true);
        const diary = await diaryApi.draftFromChat(finished.sessionId, todaySeoul(), operation.signal);
        if (!operation.signal.aborted) openDiary(diary.id, !diary.savedAt);
        return;
      }
      setDiaryText(finished.lines.join('\n')); go('DiaryEditor');
    } catch (error) {
      if (!operation.signal.aborted) setDraftError(`${(error as Error).message} 아래 일기 생성 버튼으로 다시 시도할 수 있어요.`);
    } finally {
      if (draftOperation.current === operation) { draftOperation.current = null; setDraftGenerating(false); }
    }
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
    if (!live || (screen !== 'DiaryEditor' && screen !== 'DiaryDetail' && screen !== 'DiarySaved')) { setLiveDiary(null); return; }
    if (screen === 'DiarySaved' && liveDiary?.id === diaryId) return;
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
    // Preserve preview entry only when no real login provider is configured.
    const configured = hasSocialConfiguration();
    const enterPreview = () => { go('Home', true); setNotice('로그인 없이 미리보기로 들어왔어요. 데이터는 이 브라우저에만 저장돼요.'); };
    actions['91:79'] = ['카카오 로그인', configured ? () => startLogin('kakao') : enterPreview];
    actions['227:217'] = ['구글 로그인', configured ? () => startLogin('google') : enterPreview];
    actions['91:69'] = ['네이버 로그인', configured ? () => startLogin('naver') : enterPreview];
  }
  if (screen === 'Home') {
    link(['94:104'], '마이페이지', 'MyPage'); link(['10:530','10:518','10:480'], '대화 시작하기', 'Chat');
    link(['10:504'], '캐릭터 선택', 'Characters'); link(['17:17'], '오늘의 기록', 'Diary');
    link(['17:40','106:90'], '마음 캘린더', 'Calendar'); link(['17:48'], '대화 보관함', 'Archive');
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
    actions['28:3191'] = ['월 선택', () => { if (diaryFilter.mode !== 'month') chooseFilter({ ...diaryFilter, mode: 'month' }); else setMonthMenu(open => !open); }];
    actions['28:3192'] = ['이번 달 기록', () => chooseFilter({ ...diaryFilter, mode: 'thisMonth' })];
    actions['155:119'] = ['이번 주 기록', () => chooseFilter({ ...diaryFilter, mode: 'thisWeek' })];
    link(['28:3046','28:3210'], '오늘을 기록하러 가기', 'DiaryChoice');
    link(['28:3054','155:214'], '지난 일기 보기', 'DiaryDetail'); link(['28:3187','28:3211'], '마음 캘린더', 'Calendar');
  }
  if (screen === 'DiaryChoice') { link(['33:3928'], '모우와 대화하고 자동 기록하기', 'Chat'); link(['33:3927'], '직접 작성하기', 'DiaryEditor'); actions['227:138'] = ['닫기', back]; }
  if (screen === 'DiaryEditor') actions['155:606'] = ['일기 저장', live ? () => { void saveLiveDiary(); } : () => { if (diaryText) localStorage.setItem('mowoo.diary', diaryText); go('DiarySaved'); }];
  if (screen === 'DiaryDetail') actions['113:2810'] = ['수정하기', live && liveDiary ? () => openDiary(liveDiary.id, true) : () => go('DiaryEditor')];
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
    if (screen === 'Login' && ['91:79', '227:217', '91:69'].includes(id)) { extra.disabled = authenticating; extra['aria-busy'] = authenticating; extra['aria-disabled'] = authenticating; }
    if (name === 'tabler:chevron-left') action = ['뒤로 가기', back];
    if (!previewOnly && screen !== 'Login' && name === 'logo') children = [...Children.toArray(children),
      <button key="home-logo" type="button" className="chat-home-logo" aria-label="홈으로 이동" onClick={() => go('Home')} />];
    if (['120:460','113:2809','33:3939'].includes(id)) Object.assign(extra, { 'data-scroll-key':id, tabIndex:0, role:'region', 'aria-label':id === '120:460' ? '캐릭터 설명' : '일기 본문' });
    if (['Diary','Calendar','Archive'].includes(screen) && id === screens[screen].nodeId) extra['data-scroll-key'] = screen;
    if (name === 'tabler:photo' && screen === 'DiaryEditor') action = ['사진 첨부', () => fileInput.current?.click()];
    if (name === 'tabler:photo' && screen === 'Chat') action = ['사진 첨부', () => setNotice('대화에서는 아직 사진을 보낼 수 없어요.')];
    if (name === 'tabler:microphone') action = ['음성 입력', () => setNotice('음성 입력은 아직 연결되지 않았어요.')];
    if (action) { const [label, run] = action; Object.assign(extra, { role: 'button', tabIndex: extra.disabled ? -1 : 0, 'aria-label': label, className: `${props.className ?? ''} design-action`, onClick: (e: React.MouseEvent) => { e.stopPropagation(); run(); }, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); run(); } } }); }
    if (!previewOnly) {
      if (live && screen === 'MyPage') {
        const values: Record<string, number | undefined> = {
          '33:3991': myPageStats.stats?.diaryCount,
          '33:3978': myPageStats.stats?.conversationCount,
          '33:3984': myPageStats.stats?.streak,
        };
        if (id in values) {
          children = [values[id] === undefined ? (myPageStats.error ? '—' : '…') : String(values[id])];
          extra.title = myPageStats.error || (id === '33:3978' ? '사용자와 모우가 한 번 이상 주고받은 대화 수' : id === '33:3984' ? '오늘 또는 어제부터 이어진 저장 일기의 연속 날짜 수' : '저장한 일기 수 (초안 제외)');
        }
        if (id === '33:3973') {
          const joined = membership(profile.createdAt);
          extra.className = `${props.className ?? ''} mypage-membership`;
          children = [<p key="joined">{joined?.label ?? '가입일 정보 없음'}</p>, <p key="days">{joined ? `함께한 지 ${joined.days}일` : ''}</p>];
        }
        if (id === '33:4038' && myPageStats.error) children = [...Children.toArray(children), <button key="retry-stats" type="button" className="mypage-stats-retry" onClick={myPageStats.retry}>{myPageStats.error} · 다시 시도</button>];
      }
      if (screen === 'Home' && (id === '10:525' || id === '10:541') && profile.nickname) {
        // The design's placeholder name "User" becomes the user's nickname.
        const rename = (node: ReactNode): ReactNode => typeof node === 'string' ? node.replace(/^User(\s?)$/, `${profile.nickname}$1`)
          : isValidElement<{ children?: ReactNode }>(node) ? cloneElement(node, {}, Children.map(node.props.children, rename)) : node;
        children = Children.map(children, rename);
        // Keep the arrow right after the title however long the nickname is.
        if (id === '10:541') {
          children = [...Children.toArray(children), <img key="title-arrow" className="home-week-arrow" src="/assets/1562d.svg" alt="" />];
          extra.className = `${props.className ?? ''} home-week-title`;
        }
      }
      if (screen === 'Home' && id === '106:88' && profile.nickname) return null;
      if (screen === 'Diary' && id === '28:3048') {
        const [y, m, d] = todaySeoul().split('-').map(Number);
        children = [`${y}년 ${m}월 ${d}일`];
      }
      if ((screen === 'Diary' || screen === 'Home') && id === screens[screen].nodeId) {
        children = [...Children.toArray(children), screen === 'Diary'
          ? <WeekRow key="week-row" top={439} left={27} days={week.days} byDate={week.byDate} onOpen={openWeekDiary} onEmpty={emptyDay} />
          : [<WeekRow key="week-row" top={867} left={27} days={week.days} byDate={week.byDate} onOpen={openWeekDiary} onEmpty={emptyDay} />,
             <WeekList key="week-list" top={944} left={28} byDate={week.byDate} onOpen={openWeekDiary} />]];
      }
      if (screen === 'Diary') {
        // Filter chips: the chosen one is teal, the others grey (as in the design).
        const chip = { '28:3191': 'month', '28:3192': 'thisMonth', '155:119': 'thisWeek' }[id];
        if (chip) {
          extra.style = { ...props.style, background: diaryFilter.mode === chip ? '#1e838a' : '#d9d9d9' };
          extra['aria-pressed'] = diaryFilter.mode === chip;
        }
        if (id === '28:3190') children = [`${Number(diaryFilter.month.slice(5))}월`];
        if (id === screens.Diary.nodeId && monthMenu) children = [...Children.toArray(children),
          <div key="month-menu" className="diary-month-menu" role="listbox" aria-label="월 선택">
            {recentMonths().map(month => <button key={month} type="button" role="option" aria-selected={month === diaryFilter.month}
              className={month === diaryFilter.month ? 'is-selected' : ''} onClick={() => chooseFilter({ mode: 'month', month })}>
              {month.slice(0, 4)}년 {Number(month.slice(5))}월
            </button>)}
          </div>];
      }
      if (screen === 'MyPage' && (id === '33:4004' || id === '33:4014')) {
        // My 캐릭터 cards: real descriptions instead of the design's placeholder text.
        const character = findCharacter(id === '33:4004' ? 'kind' : 'cool');
        children = [character.description]; extra.title = character.description;
        extra.className = `${props.className ?? ''} mypage-character-description`;
      }
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
      if (screen === 'Chat' && id === '97:52' && (chat.closed || chat.working || draftGenerating || !message.trim())) extra['aria-disabled'] = true;
      if (screen === 'Chat' && id === '30:3559') {
        if (chat.loading || (chat.closed && (!live || !chat.canGenerate))) return null;
        if (draftGenerating || chat.working) { extra.disabled = true; extra['aria-disabled'] = true; }
        if (draftGenerating) children = ['일기를 생성하고 있어요…'];
        else if (chat.closed) children = ['대화로 만든 일기 생성·열기'];
        if (chat.canGenerate) extra.className = `${extra.className ?? props.className ?? ''} is-ready`;
        else extra['aria-label'] = `오늘 대화로 일기 자동 생성 (대화 ${chat.turns}/${REQUIRED_TURNS}회)`;
      }
      if (screen === 'Chat' && id === '130:593') children = [`대화 진행도(${Math.min(chat.turns, REQUIRED_TURNS)}/${REQUIRED_TURNS})`];
      if (screen === 'DiaryEditor' && id === '33:3939') {
        if (live) {
          if (willResetEmotion) extra.style = { ...props.style, height: 410 };
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
      if (screen === 'DiarySaved') {
        if (id === '155:850') {
          children = [live ? liveDiary?.title ?? '' : '오늘의 기록'];
          extra.className = `${props.className ?? ''} diary-title-live`;
          extra.style = { ...props.style, fontSize: 18, fontWeight: 600 };
        }
        if (id === '155:852') children = [live ? liveDiary?.content ?? '' : diaryText];
        if (id === '155:851') children = [diaryDateLabelFor(live ? liveDiary?.entryDate ?? todaySeoul() : todaySeoul())];
      }
      if (live && screen === 'DiaryDetail' && id === '113:2807') { children = [liveDiary?.title ?? '']; extra.className = `${props.className ?? ''} diary-title-live`; }
      if (live && screen === 'DiaryDetail' && id === '155:592') {
        const primary = liveDiary?.emotionConfirmedAt ? liveDiary.emotions.find(emotion => emotion.isPrimary) : null;
        children = [<span key="confirmed-emotion" className="emotion-dot" style={{ width: '100%', height: '100%', background: primary?.colorHex ?? '#c7d4cf' }} />];
        extra.title = primary?.name ?? '감정 미확정';
      }
      if (live && screen === 'DiaryDetail' && id === '155:598') {
        const photo = liveDiary?.attachments.find(a => a.mimeType.startsWith('image/'));
        if (!photo) return null;
        children = Children.map(children, child => isValidElement<{ src?: string }>(child) && child.type === 'img' ? cloneElement(child, { src: photo.url }) : child);
      }
      if (live && screen === 'Diary' && id === '28:3049') extra.style = { ...props.style, height: Math.max(342, flowHeight - 510) };
      if (live && screen === 'Calendar' && id === '26:2993') extra.style = { ...props.style, height: Math.max(367, flowHeight - 507) };
      if (!live && screen === 'Calendar' && id === screens.Calendar.nodeId) {
        children = [...Children.toArray(children), <LiveCalendar key="preview-calendar" preview onOpen={(_, date) => openDiaryDate(date)} onNotice={setNotice} />];
      }
      if (live && (screen === 'Diary' || screen === 'Calendar') && id === screens[screen].nodeId) {
        extra.className = `${props.className ?? ''} record-flow-page record-flow-${screen.toLowerCase()}`;
        children = [...(Children.toArray(children)), screen === 'Diary'
          ? <LiveDiaryList key={`live-diaries-${diaryRange(diaryFilter).from}-${diaryRange(diaryFilter).to}`} top={599} {...diaryRange(diaryFilter)} onOpen={diaryId => openDiary(diaryId)} />
          : <LiveCalendar key="live-calendar" onOpen={diaryId => openDiary(diaryId)} onNotice={setNotice} />];
      }
      if (screen === 'Home' && characterState.authenticated) {
        if (id === '10:503') children = [homeCharacter?.name ?? (characterState.loading ? '불러오는 중' : '캐릭터 선택')];
        if (id === '10:480' && homeCharacter) {
          const fallback = characterCatalog.find(item => item.key === homeCharacter.code.toLowerCase())?.image ?? characterCatalog[0].image;
          children = Children.map(children, child => isValidElement<{ src?: string; onError?: React.ReactEventHandler<HTMLImageElement> }>(child) && child.type === 'img'
            ? cloneElement(child, { src: homeCharacter.imageUrl || fallback, onError: event => {
              if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback;
            } }) : child);
        }
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
  const flowPage = !previewOnly && live && (screen === 'Diary' || screen === 'Calendar');
  const [flowHeight, setFlowHeight] = useState<number>(height);
  const [floatingBottom, setFloatingBottom] = useState(32);
  useLayoutEffect(() => {
    if (!flowPage || !stage.current) return;
    const node = stage.current;
    const update = () => setFlowHeight(node.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [flowPage, screen]);
  // Single-page designs (login, modals, chat) shrink to fit a short window so their
  // bottom buttons stay visible; long scrolling pages (Home, MyPage) fit width only.
  const scale = Math.min(1, viewport.width / 393, !flowPage && height <= 900 ? viewport.height / height : 1);
  useLayoutEffect(() => {
    if (!flowPage || screen !== 'Diary') return;
    const update = () => {
      const pageBottom = stage.current?.closest('main')?.getBoundingClientRect().bottom ?? innerHeight;
      // Float inside the visible app/panel, including when its bottom is above the viewport edge.
      setFloatingBottom(Math.max(32, innerHeight - pageBottom + 32));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [flowPage, screen, flowHeight, scale]);
  return <>
    <main className="screen-viewport" style={{width:393*scale,height:(flowPage ? flowHeight : height)*scale}}>
      <div ref={stage} className="screen-stage" style={{height:flowPage ? 'auto' : height,minHeight:flowPage ? height : undefined,transform:`scale(${scale})`}}>
        {!previewOnly && characterState.authenticated && (screen === 'Characters' || screen === 'CharacterDetail')
          ? <CharacterScreen state={characterState} showDetail={screen === 'CharacterDetail'} onBack={back} onChat={() => {
            // Start with the chosen character rather than resume an unrelated active chat.
            // Only the resume pointer is cleared; stored conversations remain in the archive.
            localStorage.removeItem('mowoo.chat.active.live');
            go('Chat');
          }} onOpen={id => {
            navigate(`/characters/detail?character=${encodeURIComponent(id)}`); setScreen('CharacterDetail'); setNotice('');
          }} />
          : enhance(Component())}
        {!previewOnly && screen === 'Chat' && <ChatThread
          messages={chat.messages} pending={chat.pending} loading={chat.loading} closed={chat.closed}
          hasOlder={chat.hasOlder} editableId={chat.editableId} onLoadOlder={chat.loadOlder} onEdit={chat.edit}
          onCharacter={() => go('Characters')}
          activeCharacterId={chat.session?.characterId ?? homeCharacter?.id}
          disabled={chat.working || draftGenerating}
          draftError={draftError}
          sessionId={chat.session?.id ?? null}
          usePastDiaries={live && profile.usePastDiaries}
          comparing={chat.comparing}
          onReference={chat.referenceDiary}
          onOpenDiary={id => openDiary(id)}
        />}
        {!previewOnly && screen === 'Chat' && showProgress && <div className="progress-layer" role="dialog" aria-modal="true" aria-label="대화 진행도">{progressModal()}</div>}
        {!previewOnly && screen === 'Archive' && <ArchiveList onOpen={openSession} onError={setNotice} />}
        {!previewOnly && live && screen === 'DiaryEditor' && willResetEmotion && <p className="emotion-reset-editor-notice" role="status">본문을 바꾸어 저장하면 기존 감정이 초기화돼요.<br />저장 후 감정을 다시 선택해 주세요.</p>}
        {!previewOnly && live && screen === 'DiaryDetail' && liveDiary && <DiaryEmotions key={liveDiary.id} diary={liveDiary}
          needsReconfirmation={!liveDiary.emotionConfirmedAt && emotionReminders.pending(liveDiary.id)}
          onConfirmed={diary => { setLiveDiary(diary); emotionReminders.mark(diary.id, false); }} />}
        {!previewOnly && live && screen === 'DeleteSelected' && <LiveDeleteList selected={selectedDiaries} onToggle={id => setSelectedDiaries(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />}
      </div>
    </main>
    {flowPage && screen === 'Diary' && <button type="button" className="diary-create-floating" style={{ bottom: floatingBottom }} aria-label="오늘을 기록하러 가기" onClick={() => go('DiaryChoice')}>
      <img src="/assets/6349b.svg" alt="" />
    </button>}
    <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => { const file=e.target.files?.[0]; if(file){setAttachment(URL.createObjectURL(file));setNotice('사진을 선택했어요. 업로드 API 연결은 아직 필요해요.');} }} />
    {notice && <div className="notice" role="status">{notice}</div>}
    {authenticating && <div className="notice" role="status">로그인을 완료하고 있어요…</div>}
  </>;
}
