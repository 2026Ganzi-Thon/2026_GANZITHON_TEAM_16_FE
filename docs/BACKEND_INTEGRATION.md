# 백엔드 API 연동 가이드

## 현재 연결 구조

브라우저 `http://localhost:3000` → 상대 경로 `/api/v1/...` → Vite 개발 프록시 → Spring Boot `http://localhost:8080` → MySQL.

- `src/lib/http.ts`: HTTP 요청·Bearer 헤더·토큰 저장. `src/features/auth/api.ts`, `src/features/profile/api.ts`: 도메인별 API 함수.
- `src/features/auth/useAuth.ts`: 카카오 콜백·인증. `src/hooks/useProfile.ts`: 인증 변경 시 프로필 조회와 저장·실패 복구. `src/App.tsx`: 화면과 기능 연결.
- `vite.config.ts`: `/api` 요청을 백엔드 8080으로 전달.
- 개발 프록시를 쓰므로 브라우저에는 프론트와 같은 출처의 `/api` 요청으로 보입니다. 백엔드를 직접 호출하는 구조로 바꾸면 백엔드 CORS 허용 출처와 쿠키 정책도 맞춰야 합니다.

## 1. 로컬 환경 준비

백엔드는 [팀 저장소](https://github.com/2026Ganzi-Thon/2026_GANZITHON_TEAM_16_BE)에서 로그인·프로필 API가 반영된 브랜치를 사용합니다. 검증 당시 브랜치는 `feat/kakao-auth`였습니다. 최신 병합 여부는 팀과 확인하세요.

백엔드에는 JDK 21, 실행 중인 MySQL과 `mowoo` 데이터베이스가 필요합니다.

```sql
CREATE DATABASE IF NOT EXISTS mowoo CHARACTER SET utf8mb4;
```

백엔드 루트의 `.env` 예시입니다. 실제 값은 팀에서 별도로 전달받습니다.

```dotenv
DB_URL=jdbc:mysql://localhost:3306/mowoo
DB_USERNAME=root
DB_PASSWORD=본인_로컬_MySQL_비밀번호
JWT_SECRET=팀에서_전달받은_32바이트_이상_비밀값
KAKAO_CLIENT_ID=카카오_REST_API_키
KAKAO_CLIENT_SECRET=카카오_클라이언트_시크릿
KAKAO_REDIRECT_URI=http://localhost:3000/login/oauth2/code/kakao
AUTH_COOKIE_SECURE=false
```

`AUTH_COOKIE_SECURE=false`는 로컬 HTTP 검증용입니다. HTTPS 배포 환경에서는 백엔드 쿠키 설정을 배포 주소에 맞춰 구성합니다. 백엔드 코드의 기본값은 `true`입니다. 환경변수 이름은 `KAKAO_REDIRECT_URI`이며, 줄 끝에 역슬래시를 붙이지 않습니다.

프론트 루트에서는 `.env.example`을 `.env.local`로 복사합니다.

```dotenv
VITE_KAKAO_CLIENT_ID=위와_동일한_카카오_REST_API_키
VITE_KAKAO_REDIRECT_URI=http://localhost:3000/login/oauth2/code/kakao
```

`VITE_` 값은 브라우저에 노출됩니다. 프론트에 Client Secret, JWT Secret, DB 비밀번호를 넣지 않습니다. 카카오 앱에도 동일한 리다이렉트 URI가 등록되어 있어야 합니다.

## 2. 서버 실행

백엔드 폴더의 PowerShell:

```powershell
.\gradlew.bat bootRun
```

- 상태 확인: [health](http://localhost:8080/health)
- API 문서: [Swagger](http://localhost:8080/swagger-ui/index.html)

별도 터미널에서 프론트 저장소 루트:

```sh
npm ci
npm run dev
```

브라우저에서 [로그인](http://localhost:3000/)을 엽니다. `localhost`와 `127.0.0.1`을 섞으면 sessionStorage와 쿠키의 출처가 달라질 수 있습니다. 포트 3000이 사용 중이면 기존 프론트 실행을 정리한 후 재실행합니다. 환경변수를 수정한 뒤에도 프론트 서버를 재시작합니다.

## 3. 로그인·인증 흐름

1. 로그인 화면에서 카카오 버튼을 클릭합니다.
2. 프론트가 카카오 인가 화면으로 이동합니다.
3. 카카오가 `/login/oauth2/code/kakao?code=...`로 돌려보냅니다.
4. 프론트가 `authApi.login(code)`로 인가 코드를 백엔드에 전달합니다.
5. 성공 응답의 `accessToken`을 sessionStorage의 `mowoo.accessToken`에 저장합니다.
6. 인증 변경 이벤트로 `profileApi.get()`을 실행해 정보를 갱신하며, 로그인 콜백은 메인 화면으로 이동합니다.

`request()`는 저장된 토큰을 `Authorization: Bearer <token>` 헤더에 넣고 `credentials: 'include'`로 요청합니다. JSON 요청에는 Content-Type을 붙입니다. 실패 시 `error.message`, `message` 순으로 오류 문구를 사용합니다.

Refresh Token은 백엔드가 `refresh_token` HttpOnly 쿠키로 설정하며, 프론트 JavaScript로 읽지 않습니다. 확인한 백엔드 구현은 `SameSite=Lax`, Path `/api/v1/auth`를 사용합니다. 로그아웃은 해당 쿠키를 만료하고 프론트 sessionStorage의 Access Token도 삭제합니다.

## 4. 연결된 API

| 메서드·경로 | 함수 | 입력 | 사용·응답 |
| --- | --- | --- | --- |
| POST `/api/v1/auth/kakao` | `authApi.login(code)` | `{ "code": "새 인가 코드" }` | 로그인 콜백에서 호출, `accessToken` 저장 |
| GET `/api/v1/me` | `profileApi.get()` | Bearer 인증 | 로그인 직후 및 인증된 앱 최초 로딩 시 프로필 조회 |
| PATCH `/api/v1/me` | `profileApi.update(changes)` | 변경할 프로필 필드 | 내 정보 저장과 마이페이지 설정 토글 |
| POST `/api/v1/auth/reissue` | `authApi.reissue()` | 갱신 쿠키 | 함수만 제공. 자동 재발급 흐름은 미연결 |
| POST `/api/v1/auth/logout` | `authApi.logout()` | Bearer 인증 | 내 정보 화면의 로그아웃 |

프로필 수정 가능한 필드: `nickname`, `email`, `birthDate`, `usePastDiaries`, `eveningReminderEnabled`.

```json
{
  "nickname": "모우사용자",
  "email": "user@example.com",
  "birthDate": "2004-02-27"
}
```

설정 저장은 해당 필드만 보냅니다.

```json
{ "eveningReminderEnabled": true }
```

생년월일·이메일을 비워 저장하면 프론트는 `null`로 전달합니다. API 응답은 `data`로 한 번 감싼 구조가 아니라 성공 메타데이터와 프로필 필드가 최상위에 있습니다. 프로필 응답에는 `id`, `nickname`, `email`, `birthDate`, `profileImageUrl`, `createdAt` 및 설정 두 값이 포함됩니다.

토글은 저장 중 중복 조작을 막고, 저장 실패 시 화면을 원래 값으로 되돌립니다.

## 5. 실제 연동 확인

1. 프론트에서 카카오 로그인 후 내 정보로 이동합니다.
2. 개발자 도구 Network에서 `auth/kakao`, GET `me`의 성공을 확인합니다.
3. 닉네임을 수정하고 PATCH `me`의 요청·응답을 확인합니다.
4. 새로고침 후에도 닉네임이 유지되는지 확인합니다.
5. Swagger에서도 같은 계정의 GET `/api/v1/me`를 호출해 변경값을 확인합니다.

Swagger 인증은 프론트 Application → Session Storage → `http://localhost:3000`의 `mowoo.accessToken` 값을 복사해 Authorize에 등록합니다. 따옴표나 `Bearer `를 직접 붙이지 않습니다. 토큰은 채팅·커밋·공유 스크린샷에 포함하지 않습니다.

설정은 켜기 → 끄기 → 새로고침 → GET `/me`로 확인합니다. 로그아웃 뒤 재발급 API가 `401 / INVALID_REFRESH_TOKEN`을 반환하는지도 확인할 수 있습니다.

### 확인된 범위

- 백엔드 Swagger: 실제 카카오 로그인, 프로필 조회·닉네임 수정, 재로그인 후 ID·닉네임 유지, 재발급·로그아웃·재발급 거부, 입력 검증, 설정 저장·복구 확인.
- 프론트 실제 연동: 프론트에서 `yuldo04-test`로 닉네임 수정 후 Swagger GET `/me`에서 동일한 사용자 ID와 변경값 확인.
- 토글 변경의 저장 실패 복구와 중복 요청 방지는 브라우저 모의 API로 검사했습니다. 이후 UI 수정 전체를 실계정으로 다시 검증한 것으로 간주하지 않습니다.

## 6. 오류 확인

| 증상 | 확인할 내용 |
| --- | --- |
| 프론트 수정은 되는데 서버에는 없음 | `mowoo.accessToken` 존재 여부 확인. 비로그인 미리보기는 localStorage에만 저장 |
| GET/PATCH `me`가 401 | Authorization 헤더, 토큰 따옴표·공백·만료 확인. 자동 재발급이 없으므로 현재는 재로그인 필요 |
| 로그인 시 `SOCIAL_CODE_INVALID` | 인가 코드 만료·재사용, 카카오 키·리다이렉트 URI 불일치 확인 |
| 로그인 후 3000 연결 거부 | 프론트 실행 여부 및 포트 확인 |
| `/api` 요청 실패·프록시 연결 거부 | 백엔드 8080 실행 상태와 Network·서버 로그 확인 |
| 재발급 401 | 갱신 쿠키 존재·만료·Path·Secure 설정, 로그아웃 여부 확인 |
| 프론트 변경이 Swagger에 안 보임 | GET의 Execute 재실행 및 같은 계정의 유효한 토큰 사용 여부 확인. Example Value는 실제 결과가 아님 |

## 7. 후속 연동 작업

- `authApi.reissue()` 호출 후 `tokens.set()`과 실패한 요청 재시도를 연결해야 합니다. 현재 401에 자동 재시도하지 않습니다.
- 대화·일기·캘린더·캐릭터·기록 삭제는 예시 UI입니다. 아직 합의하지 않은 API 경로나 응답 형식을 임의로 연결하지 않았습니다.
- 백엔드 기능이 준비되면 요청·응답 타입을 `src/features/` 아래 도메인별 모듈에 정의하고, `App.tsx`의 예시 상태를 실제 데이터로 교체합니다. 소유권·오류·로딩·빈 목록도 함께 확인합니다.
- 서버 삭제 기능을 붙이기 전 현재 삭제 완료 모달이 실제 서버 기록을 삭제하지 않는다는 점에 유의합니다.
- 이미지 업로드, 음성 입력, 구글·네이버 로그인은 별도 구현이 필요합니다.
- `npm run preview`와 정적 배포에는 개발 프록시가 적용되지 않습니다. 배포 서버에서 `/api`를 실제 백엔드로 전달하고, SPA 새로고침 경로·HTTPS·카카오 리다이렉트 URI를 구성합니다.
