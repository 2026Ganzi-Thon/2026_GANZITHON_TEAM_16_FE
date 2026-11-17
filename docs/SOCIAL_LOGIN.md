# 구글·네이버 로그인 설정과 확인

## 작업 범위

`feature/social-login`은 월간 회고 브랜치의 커밋 `ff908a1`에서 시작했습니다. 월간 회고 PR은 그대로 유지하며, 새 브랜치의 코드만 추가했습니다. 회고 PR 병합 후 최신 develop을 반영하고 PR 대상은 develop으로 확인합니다.

구글·네이버 버튼, 인가 요청, 콜백, 백엔드 코드 교환, 토큰 저장과 프로필 재조회까지 공통 인증 흐름으로 연결합니다. 같은 창에서 돌아오는 인가 코드 방식이며 별도 소셜 SDK는 추가하지 않았습니다.

## 필요한 설정

| 제공자 | 프론트 환경 변수 | 로컬 콜백 |
|---|---|---|
| 카카오 | VITE_KAKAO_CLIENT_ID / VITE_KAKAO_REDIRECT_URI | http://localhost:3000/login/oauth2/code/kakao |
| 구글 | VITE_GOOGLE_CLIENT_ID / VITE_GOOGLE_REDIRECT_URI | http://localhost:3000/login/oauth2/code/google |
| 네이버 | VITE_NAVER_CLIENT_ID / VITE_NAVER_REDIRECT_URI | http://localhost:3000/login/oauth2/code/naver |

각 ID는 공개 클라이언트 ID입니다. Client Secret은 백엔드 설정에만 두고 VITE_ 변수로 넣지 않습니다. .env.local은 Git에서 제외되며 변경 후 개발 서버를 재시작합니다.

- 구글 콘솔에서 웹 클라이언트의 승인된 리디렉션 URI를 등록하고, 동의 화면/테스트 사용자 설정을 확인합니다. 인가 범위는 openid/profile/email입니다.
- 네이버 개발자 센터에서 웹 서비스 URL과 Callback URL을 등록하고, 개발 상태일 경우 테스트 계정 사용 권한을 확인합니다.
- 제공자 콘솔, 프론트, 백엔드의 redirect URI가 모두 일치해야 합니다. localhost와 127.0.0.1, http와 https, 포트가 다르면 같은 출처가 아닙니다.
- 배포 프론트 URL은 아직 정해지지 않았으므로 배포할 때 등록·환경 설정을 다시 맞춥니다. API_PROXY_TARGET은 Vite 개발 프록시 설정이며 프론트 운영 API 라우팅과 별개입니다.

2026-11-17 확인 시 배포 OpenAPI에는 POST /api/v1/auth/google, /naver가 모두 존재합니다. API 존재만으로 제공자 키·동의 화면·실계정 로그인 성공이 확인되는 것은 아닙니다.

## 요청 계약과 state

- 구글: https://accounts.google.com/o/oauth2/v2/auth, response_type=code, scope=openid profile email.
- 네이버: https://nid.naver.com/oauth2.0/authorize, response_type=code.
- 세 제공자 모두 crypto.getRandomValues로 만든 state를 요청에 넣습니다. 탭당 가장 최근 로그인 시도 한 개만 허용합니다.
- 콜백의 제공자·state·시작 출처·redirect URI·10분 유효시간을 확인한 뒤 백엔드를 호출합니다. 비교 실패 시 코드를 보내지 않습니다.
- 카카오/구글은 JSON {code}, 네이버는 {code,state}를 각 /api/v1/auth/{provider}로 보냅니다. 기존 Bearer는 보내지 않습니다.
- 검증된 state는 코드 교환 전에 소비합니다. 진행 중 Promise만 공유하므로 StrictMode 중복 호출은 막되 성공한 토큰을 재사용하지 않습니다.
- 로그인 진행 중 다른 제공자로 중복 교환하지 않습니다. 취소·만료·실패는 로그인 시작부터 다시 시도합니다.
- URLSearchParams로 받은 코드를 다시 decodeURIComponent 하거나 +/공백 치환하지 않습니다.
- 계정 변경 뒤 도착한 응답은 무시합니다. HttpOnly refresh cookie는 서버가 관리하고 JavaScript에서 읽지 않습니다.

## 수동 확인

1. 팀에서 전달받은 제공자 ID를 .env.local에 설정합니다. 백엔드 클라이언트 ID/secret/redirect URI 및 해당 제공자 API 활성화도 확인합니다.
2. npm run dev 후 http://localhost:3000에서 구글 또는 네이버 버튼을 누릅니다.
3. 동의·로그인 후 홈으로 돌아오고 Network의 /auth/google 또는 /auth/naver가 200인지 확인합니다. /me의 실제 프로필도 확인합니다.
4. 로그아웃 후 다른 제공자로 로그인하고, 취소했을 때 안내되는지 확인합니다.
5. 실제 액세스 토큰 만료 후 /auth/reissue와 원 요청의 재시도를 확인합니다. 단순 로그인 성공과 자동 갱신 성공을 구분합니다.

브라우저 로그인 화면의 제공자 오류, 백엔드 설정 오류, 프론트 state 검증 실패를 구분합니다. 코드·토큰·secret을 로그나 PR에 붙여넣지 않습니다.

## 자동 검사와 한계

```sh
npm run build
npm run check:social-login
npm run check:auth
npm run check:auth-refresh
```

포트 3100과 설치된 Chrome을 사용하므로 순서대로 실행합니다. 인가 화면과 API는 모의 응답입니다. 인가 파라미터·제공자 분리·state 누락/불일치/만료/재사용·취소·응답 오류·계정 변경 경합·설정 누락·저장소 차단·미리보기를 검증합니다. 실제 구글·네이버 계정 및 운영 쿠키의 성공은 이 검사에 포함하지 않습니다.

공식 계약: [구글 인가 코드 흐름](https://developers.google.com/identity/protocols/oauth2/web-server), [네이버 로그인 API](https://developers.naver.com/docs/login/api/api.md).
