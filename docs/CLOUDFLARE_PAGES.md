# Cloudflare Pages 배포

공식 FE 저장소의 develop 브랜치를 연결합니다. React (Vite), `npm run build`, 출력 `dist`, 루트는 저장소 루트입니다.

루트의 `functions/api/[[path]].js`는 `/api/*`만 `https://api.mowoo.kro.kr`로 전달합니다. Vite 개발 프록시와 별개이며, Cloudflare Git 연동 배포 시 Pages Functions로 함께 빌드됩니다. 프론트 코드의 상대 API 주소는 그대로 사용합니다. 대상 호스트는 고정돼 별도 프록시 환경 변수는 필요 없습니다.

`public/_routes.json`이 dist에 복사되어 정적 화면·이미지·폰트 요청에는 Functions를 실행하지 않습니다. 별도 404.html이 없으므로 Pages 기본 SPA fallback으로 `/chat`과 OAuth 콜백 새로고침을 처리합니다.

## 환경 변수

Cloudflare 빌드 환경에 VITE_KAKAO_CLIENT_ID, VITE_GOOGLE_CLIENT_ID, VITE_NAVER_CLIENT_ID를 등록합니다. Redirect 변수는 프로젝트의 확정된 HTTPS 주소를 사용합니다.

```
VITE_KAKAO_REDIRECT_URI=https://2026-ganzithon-team-16-fe.pages.dev/login/oauth2/code/kakao
VITE_GOOGLE_REDIRECT_URI=https://2026-ganzithon-team-16-fe.pages.dev/login/oauth2/code/google
VITE_NAVER_REDIRECT_URI=https://2026-ganzithon-team-16-fe.pages.dev/login/oauth2/code/naver
```

Client Secret·DB·AI 키는 프론트에 넣지 않습니다. API_PROXY_TARGET은 개발 전용이며 배포 설정에 넣지 않습니다. Preview 주소는 출처가 다르므로 운영 콜백 설정 그대로 실제 로그인 테스트를 하지 않습니다.

## 백엔드와 제공자 설정

백엔드 KAKAO_REDIRECT_URI / GOOGLE_REDIRECT_URI / NAVER_REDIRECT_URI도 위 주소와 일치시킵니다. 소셜 개발자 콘솔에도 각 제공자가 요구하는 콜백과 웹 서비스 URL을 등록합니다. 이 프론트 변경은 백엔드 환경 변수를 바꾸지 않습니다.

Authorization·Cookie·요청 본문을 보존하고 응답 Set-Cookie의 Domain만 제거하여 프론트 호스트에 저장합니다. HttpOnly·Secure·SameSite·Path·만료 속성은 유지합니다. API 응답은 캐시하지 않으며, 원래 상태 코드와 오류를 전달합니다. 원래 브라우저 Origin이 프론트 출처인지 확인한 후 서버 간 요청에서는 Origin을 제거하므로, 백엔드 CORS에서 프론트 출처가 누락돼 생기는 프록시 요청 차단을 방지합니다. 백엔드 리다이렉트를 자동 추적하지 않습니다.

## 검증

`npm run build`, `npm run check:cloudflare-proxy`. 자동 검사는 Node Fetch 모의 upstream으로 본문·쿠키·오류 전달을 검증합니다. 배포 후 실제 로그인·쿠키 갱신·사진 첨부 및 콜백 새로고침을 최종 확인합니다. Functions 요청에는 Workers 무료 플랜의 별도 일일 한도가 적용됩니다.
