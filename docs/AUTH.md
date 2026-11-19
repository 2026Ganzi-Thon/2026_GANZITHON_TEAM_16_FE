# 소셜 로그인 연동과 토큰 갱신

카카오·구글·네이버 인가 코드 교환을 공통 인증 흐름으로 처리합니다. 프로필 GET/PATCH는 `src/features/profile/`에서 관리합니다.

## 로컬 설정

`.env.example`을 `.env.local`로 복사하고 사용할 제공자의 공개 클라이언트 ID와 콜백 주소를 설정합니다.

```dotenv
VITE_KAKAO_CLIENT_ID=팀에서_공유받은_REST_API_키
VITE_KAKAO_REDIRECT_URI=http://localhost:3000/login/oauth2/code/kakao
VITE_GOOGLE_CLIENT_ID=구글_웹_클라이언트_ID
VITE_GOOGLE_REDIRECT_URI=http://localhost:3000/login/oauth2/code/google
VITE_NAVER_CLIENT_ID=네이버_클라이언트_ID
VITE_NAVER_REDIRECT_URI=http://localhost:3000/login/oauth2/code/naver
API_PROXY_TARGET=https://api.mowoo.kro.kr
```

로컬 백엔드를 사용할 때는 API_PROXY_TARGET을 http://localhost:8080으로 설정합니다. 브라우저 주소는 `http://localhost:3000`으로 통일하고, 각 제공자에 등록한 콜백·프론트 환경 값·백엔드 redirect-uri를 동일하게 맞춥니다. 현재 접속 출처와 콜백 출처가 다르면 state 저장소가 이어지지 않으므로 로그인 시작을 차단합니다. 프론트에 Client Secret이나 JWT Secret을 넣지 않습니다.

## 흐름

1. 제공자 버튼에서 안전한 난수 state와 10분짜리 로그인 시도를 sessionStorage에 보관하고 인가 화면으로 이동합니다. 구글 scope는 `openid profile email`입니다.
2. 콜백에서 제공자·state·출처·유효시간을 확인하고 시도를 소비한 뒤 POST `/api/v1/auth/kakao`, `/google`, `/naver`로 교환합니다. 카카오/구글 본문은 `{code}`, 네이버는 `{code,state}`입니다. 인가 코드는 URLSearchParams에서 한 번만 디코딩하며 원문을 추가 변환하지 않습니다.
3. `accessToken`을 sessionStorage의 `mowoo.accessToken`에 저장하고 메인으로 이동합니다.
4. 요청 공통 함수는 Bearer 헤더와 `credentials: include`를 사용합니다.
5. 로그아웃은 POST `/api/v1/auth/logout` 후 sessionStorage 토큰을 삭제합니다.

진행 중 코드 교환만 공유해 React StrictMode 중복 요청을 막습니다. 완료된 응답·토큰을 캐시하지 않으며 같은 콜백을 새로고침해 재사용하지 않습니다. 취소·오류·코드 누락·state 불일치·만료는 백엔드 교환을 하지 않고 로그인 화면에 안내합니다. API 요청의 제한 시간은 20초이며, 계정 변경 후 도착한 이전 로그인 응답은 버립니다. 완료/오류 후 주소에서 코드와 state를 정리합니다.

모든 제공자 ID가 비어 있을 때만 기존 미리보기 진입을 유지합니다. 하나라도 설정돼 있으면 미설정 제공자 버튼은 설정 안내를 표시하며, 실제 로그인을 가장한 미리보기로 이동하지 않습니다. 자세한 등록·검증 절차는 [SOCIAL_LOGIN.md](SOCIAL_LOGIN.md)를 참고하세요.

Refresh Token은 백엔드의 HttpOnly 쿠키로 관리합니다. 토큰이 있는 보호 API가 401을 반환하면 POST `/api/v1/auth/reissue`를 쿠키와 함께 호출하고, 새 Access Token으로 원 요청을 한 번만 재시도합니다. 갱신에는 Authorization 헤더를 넣지 않습니다. 개발 프록시는 Vite 개발 서버에만 적용되며, 배포 시 별도 `/api` 전달 설정이 필요합니다.

## 자동 갱신·재시도

- 동시 401 요청은 진행 중인 갱신 요청 한 개를 공유합니다. 갱신 완료 뒤 늦게 도착한 기존 토큰의 401은 이미 갱신한 토큰으로 재시도합니다.
- 원 요청의 메서드·본문·사용자 헤더·AbortSignal을 유지합니다. 현재 API 호출의 본문은 JSON 문자열이며, 소모되는 스트림 본문은 사용하지 않습니다.
- 갱신의 제한 시간은 15초입니다. 실패·잘못된 토큰 응답·재시도 후 401에서는 토큰을 정리하고 로그인 화면으로 이동합니다.
- 로그인/재발급 API 자체, 비로그인 요청, 403·500 응답에는 자동 갱신을 적용하지 않습니다.
- 토큰 회전은 새 로그인 이벤트를 발생시키지 않으므로 현재 화면과 선택 캐릭터를 유지합니다.
- 갱신 도중 로그아웃·계정 변경이 발생하면 이전 응답을 버리고 이전 요청을 새 계정으로 재시도하지 않습니다.
- 요청 하나를 취소해도 다른 요청이 기다리는 공통 갱신은 취소하지 않습니다.
- HttpOnly 쿠키를 JavaScript로 읽거나 새로 만들지 않습니다. 로컬 HTTP 테스트에서는 BE의 AUTH_COOKIE_SECURE=false와 동일한 localhost 사용을 확인합니다.

검사: `npm run check:auth-refresh`. 모의 HTTP API로 동시 요청·지연 401·PATCH 본문/헤더 보존·오류·무한 재시도 방지·로그인 이동·요청 취소·로그아웃/계정 변경 경합을 확인합니다. 실제 카카오 로그인·만료·쿠키 정책의 전체 검증과 구분합니다.

### 실제 백엔드·브라우저 쿠키 추가 검증 (2026-11-15)

별도 MySQL 테스트 DB와 실제 Spring 서버(8081), Vite 프록시(3100), Chrome으로 확인했습니다. 카카오 외부 응답만 테스트 대체 서버를 사용하고, 로그인 API·JWT 검증·갱신 토큰 DB·Set-Cookie·HttpOnly 쿠키 전달·재발급 API는 실제 구현을 사용했습니다.

- 로그인 API가 발급한 HttpOnly 갱신 쿠키의 저장/전달 확인.
- 서명은 유효하지만 만료된 Access Token으로 내 정보 요청 401 → 갱신 200(1회) → 원 요청 재시도 200 확인.
- JavaScript에서 HttpOnly 쿠키를 읽을 수 없는 상태에서도 갱신 성공.
- 테스트 브라우저에서 갱신 쿠키 제거 후 401 → 재발급 거부 → Access Token 삭제·로그인 이동 확인.
- 테스트 사용자만 정리하고 임시 서버를 종료했습니다. 개인 계정과 실행 중인 앱 서버는 변경하지 않았습니다.

이는 실제 카카오 계정 로그인을 포함한 전체 외부 서비스 검증은 아닙니다. 임시 포트로 검사할 때는 CORS_ALLOWED_ORIGINS에도 그 프론트 출처를 포함해야 합니다.

`npm run check:social-login`은 구글·네이버·카카오 인가 URL·state 검증·오류·중복 방지·계정 변경·설정 누락을 모의 API로 확인합니다. `check:auth`는 카카오·쿠키·로그아웃 회귀 검사입니다. 실제 제공자 계정 로그인 및 운영 쿠키 검증과 구분합니다.

관련 코드: `src/features/auth/`, `src/lib/http.ts`. 프로필 후속 기능은 `src/features/profile/`에서 별도로 관리합니다.
