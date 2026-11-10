# MOWOO Frontend

모우 프론트엔드의 초기 개발 환경입니다.

## 기술

- React 19
- TypeScript
- Vite
- CSS

## 실행

Node.js LTS와 npm을 설치한 후 저장소 최상위에서 실행합니다.

```sh
npm ci
npm run dev
```

주소: http://localhost:3000

포트 3000이 사용 중이면 기존 서버를 종료한 뒤 실행합니다.

## 빌드

```sh
npm run build
```

TypeScript 검사 후 `dist/`에 빌드 결과를 생성합니다.

```sh
npm run preview
```

## 구조

```text
src/
  App.tsx         기본 화면
  main.tsx        React 진입점
  index.css       기본 스타일
  vite-env.d.ts   Vite 타입 선언
index.html
tsconfig.json
vite.config.ts
```

초기 화면과 실행·빌드 설정만 포함합니다. 서비스 UI, 라우팅, API 연동, 인증, 환경변수는 기능 브랜치에서 추가합니다.

## 브랜치

- `main`: 초기 기준 및 안정 버전
- `develop`: 개발 통합
- `feat/*`: 기능 구현 후 `develop`으로 PR

빈 저장소의 첫 커밋을 `main`에 올린 후 동일한 커밋에서 `develop`을 생성합니다.
