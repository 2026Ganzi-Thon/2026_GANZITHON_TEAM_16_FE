export type SocialProvider = 'kakao' | 'google' | 'naver';
export const providerNames: Record<SocialProvider, string> = { kakao: '카카오', google: '구글', naver: '네이버' };
const providerConfig = {
  kakao: { clientId: import.meta.env.VITE_KAKAO_CLIENT_ID, redirect: import.meta.env.VITE_KAKAO_REDIRECT_URI, authorize: 'https://kauth.kakao.com/oauth/authorize' },
  google: { clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID, redirect: import.meta.env.VITE_GOOGLE_REDIRECT_URI, authorize: 'https://accounts.google.com/o/oauth2/v2/auth' },
  naver: { clientId: import.meta.env.VITE_NAVER_CLIENT_ID, redirect: import.meta.env.VITE_NAVER_REDIRECT_URI, authorize: 'https://nid.naver.com/oauth2.0/authorize' },
};
const pendingKey = 'mowoo.oauth.pending';
const lifetime = 10 * 60 * 1000;
interface LoginAttempt { provider: SocialProvider; state: string; createdAt: number; origin: string; redirect: string }

export const hasSocialConfiguration = () => Object.values(providerConfig).some(config => Boolean(config.clientId?.trim()));

export function authorizationUrl(provider: SocialProvider): string {
  const config = providerConfig[provider];
  if (!config.clientId?.trim()) throw new Error(`${providerNames[provider]} 로그인 설정이 아직 준비되지 않았어요.`);
  const callbackPath = `/login/oauth2/code/${provider}`;
  let redirect: URL;
  try { redirect = new URL(config.redirect?.trim() || `${location.origin}${callbackPath}`); }
  catch { throw new Error('로그인 콜백 주소 설정을 확인해 주세요.'); }
  if (redirect.origin !== location.origin || redirect.pathname !== callbackPath || redirect.search || redirect.hash || redirect.username || redirect.password) {
    throw new Error('현재 접속 주소와 로그인 콜백 설정이 맞지 않아요. 접속 주소와 설정을 확인해 주세요.');
  }
  const state = [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2, '0')).join('');
  const attempt: LoginAttempt = { provider, state, createdAt: Date.now(), origin: location.origin, redirect: redirect.href };
  try { sessionStorage.setItem(pendingKey, JSON.stringify(attempt)); }
  catch { throw new Error('로그인 정보를 보관할 수 없어요. 브라우저 저장소 사용을 허용한 뒤 다시 시도해 주세요.'); }
  const params = new URLSearchParams({ client_id: config.clientId.trim(), redirect_uri: redirect.href, response_type: 'code', state });
  if (provider === 'google') params.set('scope', 'openid profile email');
  return `${config.authorize}?${params}`;
}

/** Consume before code exchange. StrictMode joins the in-flight exchange in useAuth. */
export function consumeAttempt(provider: SocialProvider, state: string | null): void {
  let attempt: LoginAttempt | null;
  try { attempt = JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null'); }
  catch { throw new Error('로그인 정보를 확인할 수 없어요. 로그인 버튼부터 다시 눌러 주세요.'); }
  if (!attempt || attempt.provider !== provider || !state || attempt.state !== state || attempt.origin !== location.origin
    || attempt.redirect !== `${location.origin}/login/oauth2/code/${provider}`
    || typeof attempt.createdAt !== 'number' || !Number.isFinite(attempt.createdAt) || Date.now() - attempt.createdAt < 0 || Date.now() - attempt.createdAt > lifetime) {
    throw new Error('로그인 요청이 만료됐거나 일치하지 않아요. 로그인 버튼부터 다시 눌러 주세요.');
  }
  try { sessionStorage.removeItem(pendingKey); }
  catch { throw new Error('로그인 정보를 정리할 수 없어요. 브라우저 저장소 설정을 확인해 주세요.'); }
}
