# 카카오 로그인 연동

이 브랜치는 `feature/frontend-ui` 위에 인증 기능만 추가합니다. 프로필 GET/PATCH API는 다음 `feature/user-profile-api`에서 추가합니다. 현재 내 정보와 설정은 여전히 로컬 예시 값입니다.

## 로컬 설정

`.env.example`을 `.env.local`로 복사하고 카카오 REST API 키를 설정합니다.

```dotenv
VITE_KAKAO_CLIENT_ID=팀에서_공유받은_REST_API_키
VITE_KAKAO_REDIRECT_URI=http://localhost:3000/login/oauth2/code/kakao
```

백엔드를 8080, 프론트를 3000에서 실행합니다. 브라우저 주소는 `http://localhost:3000`으로 통일하고 카카오에 등록된 리다이렉트 URI도 일치시킵니다. 프론트에 Client Secret이나 JWT Secret을 넣지 않습니다.

## 흐름

1. 카카오 버튼으로 인가 화면을 엽니다.
2. 콜백의 일회용 인가 코드를 POST `/api/v1/auth/kakao`로 교환합니다.
3. `accessToken`을 sessionStorage의 `mowoo.accessToken`에 저장하고 메인으로 이동합니다.
4. 요청 공통 함수는 Bearer 헤더와 `credentials: include`를 사용합니다.
5. 로그아웃은 POST `/api/v1/auth/logout` 후 sessionStorage 토큰을 삭제합니다.

Refresh Token은 백엔드의 HttpOnly 쿠키로 관리합니다. `authApi.reissue()` 함수는 제공하지만 만료 시 자동 재발급·요청 재시도는 아직 연결하지 않습니다. 개발 프록시는 Vite 개발 서버에만 적용되며, 배포 시 별도 `/api` 전달 설정이 필요합니다.

React StrictMode에서 같은 인가 코드가 중복 교환되지 않도록 진행 중인 콜백 요청을 공유합니다. 이 브랜치의 모의 API 검사는 실제 카카오·서버 통합 검증과 구분합니다.

관련 코드: `src/features/auth/`, `src/lib/http.ts`. 프로필 API 파일은 아직 없습니다.
