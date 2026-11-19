# 모우(MOWOO) — Frontend

> 모든 고민에는 우리만의 이야기가 있으니까.

모우는 AI 캐릭터와 오늘의 이야기를 나누고, 대화를 일기로 남기며 감정의 흐름을 돌아보는 서비스입니다.
이 저장소는 2026 간지톤 16팀의 공식 프론트엔드 저장소입니다.

## 서비스 이용

| 구분 | 링크 |
| --- | --- |
| 웹 서비스 | [모우 시작하기](https://2026-ganzithon-team-16-fe.pages.dev) |
| Android APK | [v1.0.0 릴리스에서 다운로드](https://github.com/2026Ganzi-Thon/2026_GANZITHON_TEAM_16_FE/releases/tag/v1.0.0) |

- **Android:** 릴리스의 Assets에서 APK를 다운로드하고 설치합니다. 필요한 경우 다운로드에 사용한 앱의 ‘출처를 알 수 없는 앱 설치’를 허용합니다.
- **iPhone:** Safari에서 웹 서비스를 연 뒤 **공유 → 홈 화면에 추가**로 설치합니다.
- **웹:** 모바일·PC 브라우저에서 접속할 수 있습니다. 로그인 후 주요 기능을 이용합니다.

Android APK는 PWABuilder의 TWA 방식으로 배포한 웹 기반 앱입니다. 서비스 이용에는 인터넷 연결이 필요하며, 오프라인에서는 연결 안내를 제공합니다.

## 주요 기능

| 기능 | 내용 |
| --- | --- |
| 소셜 로그인 | 카카오·네이버·구글 로그인, 로그인 유지·로그아웃 및 비로그인 경로 접근 제어 |
| 모우 캐릭터 | 캐릭터 소개 확인과 보유 캐릭터 선택 |
| AI 대화 | 선택한 모우와 대화, 사진 첨부, 메시지 수정 및 이전 대화 조회 |
| 과거 일기 활용 | 설정에 동의한 사용자가 과거 일기를 추천받고 직접 선택해 비교 대화 |
| 대화로 일기 생성 | 5회 이상 대화 후 일기 생성, 제목·본문 확인 및 수정·저장 |
| 직접 일기 작성 | 제목·본문·사진을 넣어 작성하고 저장한 일기 수정 |
| 감정 기록 | 일기의 감정 선택·확정·변경 |
| 기록 조회 | 오늘의 기록, 날짜별 마음 캘린더, 월간 마음 회고 |
| 대화 보관함 | 이전 대화 다시 열기와 대화 삭제 |
| 마이페이지 | 기록 통계, 닉네임·생년월일 수정, 소셜 이메일 잠금, 기록 설정 및 계정 탈퇴 |

## 기술 스택

- **프론트엔드:** React 19, TypeScript, Vite
- **스타일:** CSS, Figma 기반 디자인 자산, Pretendard
- **배포:** Cloudflare Pages 및 Pages Functions
- **설치 지원:** Web App Manifest, Service Worker, PWABuilder TWA
- **검증:** Playwright 기반 브라우저 검사, TypeScript·Vite 빌드

프론트엔드의 `/api/*` 요청은 프록시를 통해 백엔드로 전달합니다. AI 응답 생성과 데이터 저장은 백엔드 API가 담당합니다.

## 로컬 실행

Node.js와 npm을 설치한 뒤 저장소 루트에서 실행합니다.

```sh
npm ci
```

`.env.example`을 `.env.local`로 복사하고 로그인 설정과 백엔드 주소를 입력합니다.

```dotenv
VITE_KAKAO_CLIENT_ID=카카오_클라이언트_ID
VITE_KAKAO_REDIRECT_URI=http://localhost:3000/login/oauth2/code/kakao
VITE_GOOGLE_CLIENT_ID=구글_클라이언트_ID
VITE_GOOGLE_REDIRECT_URI=http://localhost:3000/login/oauth2/code/google
VITE_NAVER_CLIENT_ID=네이버_클라이언트_ID
VITE_NAVER_REDIRECT_URI=http://localhost:3000/login/oauth2/code/naver

# 배포된 백엔드에 연결
API_PROXY_TARGET=https://api.mowoo.kro.kr
```

```sh
npm run dev
```

접속 주소는 [http://localhost:3000](http://localhost:3000)입니다. `API_PROXY_TARGET`을 비우면 `http://localhost:8080`의 로컬 백엔드에 연결합니다.

소셜 개발자 콘솔과 백엔드에도 같은 콜백 주소를 등록해야 합니다. 브라우저 접속 주소도 `localhost:3000`으로 맞춥니다. 로그인하지 않은 상태에서 보호된 경로로 직접 접속하면 로그인 화면으로 이동합니다.

`.env.local`은 커밋하지 않습니다. `VITE_*` 값은 브라우저에 공개되므로 Client Secret, 데이터베이스 비밀번호, AI API 키를 넣지 않습니다.

## 빌드와 검증

```sh
# TypeScript 검사 및 프로덕션 빌드 — 출력: dist/
npm run build

# 주요 기능 검사 — 브라우저 검사에는 Chrome 필요
npm run check:social-login
npm run check:chat-improvements
npm run check:photo-attachments
npm run check:diary-pagination
npm run check:profile-api
npm run check:pwa
npm run check:cloudflare-proxy
```

기능 검사의 API 모의 응답은 프론트엔드 동작을 검증하기 위한 것입니다. 실제 배포 환경의 로그인·AI 응답·사진 업로드와 모바일 키보드 동작은 별도로 확인합니다. 상세 검사 방법은 [검증 문서](docs/TESTING.md)를 참고하세요.

## 배포

- **운영 브랜치:** `main`
- **통합 브랜치:** `develop`
- **Cloudflare Pages 빌드:** `npm run build` / 출력 디렉터리 `dist`
- **API 연결:** Pages Functions가 `/api/*`를 배포된 백엔드로 전달
- **로그인 설정:** Cloudflare 빌드 환경에 제공자별 Client ID와 운영 주소의 Redirect URI 등록

`API_PROXY_TARGET`은 Vite 개발 서버 전용 설정입니다. Preview 배포는 운영 도메인과 출처가 달라 소셜 로그인 콜백을 별도로 등록하지 않으면 로그인 테스트가 제한됩니다.

Android 앱의 사이트 연결 정보는 `public/.well-known/assetlinks.json`에서 관리합니다. APK 서명 키와 비밀번호는 저장소에 포함하지 않습니다.

## 관련 문서

- [소셜 로그인](docs/SOCIAL_LOGIN.md)
- [백엔드 연동](docs/BACKEND_INTEGRATION.md)
- [API 연동 현황](docs/API_INTEGRATION.md)
- [캐릭터 API](docs/CHARACTER_API.md)
- [사진 첨부](docs/PHOTO_ATTACHMENTS.md)
- [월간 마음 회고](docs/MONTHLY_RECAP.md)
- [Cloudflare Pages 배포](docs/CLOUDFLARE_PAGES.md)
- [PWA 설치와 Android 패키징](docs/PWA.md)
- [검증 방법](docs/TESTING.md)

관련 문서에는 기능 도입 당시의 작업 기록이 포함되어 있습니다. 현재 서비스 주소와 운영 브랜치는 이 README를 기준으로 확인해 주세요.
