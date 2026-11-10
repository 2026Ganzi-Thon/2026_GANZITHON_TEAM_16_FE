# MOWOO Frontend — UI

React + TypeScript + Vite 기반 피그마 UI 구현입니다. 이 브랜치에는 로그인 인증, 토큰 처리, HTTP 요청, 백엔드 프록시가 없습니다.

## 실행

```sh
npm ci
npm run dev
```

http://localhost:3000/ 에서 카카오 모양 버튼을 누르면 로그인 없이 UI 미리보기로 이동합니다. 직접 /home으로 접근할 수도 있습니다.

## 포함 범위

- 피그마 20개 화면·모달과 원본 자산 120개
- 화면 이동, 실제 방문 순서의 뒤로가기·스크롤 복원
- 로컬 프로필 편집·설정 토글·일기 편집·선택 체크박스
- 브라우저 localStorage로 미리보기 값 저장

대화 횟수와 일기 생성 버튼은 예시 화면입니다. AI 응답·서버 데이터·실제 기록 삭제는 연결되지 않았습니다.

## 확인

```sh
npm run build
npm run check:layout
npm run check:navigation
npm run check:controls
```

브라우저 검사는 Chrome이 필요합니다. 상세 경로와 검사는 [검증 문서](docs/TESTING.md)를 참고하세요. 393px 디자인을 기준으로 좁은 화면에서는 축소합니다. SF Pro는 Arial로 대체합니다.

## 브랜치 범위

이 PR: feature/frontend-ui → develop. 다음 작업은 feature/kakao-login, 그다음 feature/user-profile-api 순서입니다.
