# 화면과 검증

## 화면 주소

| 경로 | 화면 |
| --- | --- |
| `/`, `/home` | 로그인·메인 |
| `/mypage`, `/me`, `/me/edit` | My 모우·내 정보·수정 |
| `/characters`, `/characters/detail` | 캐릭터·상세 모달 |
| `/chat`, `/chat/ready`, `/chat/progress` | 대화·일기 생성 가능·진행도 |
| `/diary`, `/diary/new` | 오늘의 기록·작성 방식 선택 |
| `/diary/write`, `/diary/saved`, `/diary/detail` | 작성·저장 모달·상세 |
| `/calendar`, `/archive` | 감정 캘린더·대화 보관함 |
| `/records/delete-all`, `/records/select`, `/records/deleted` | 기록 삭제 관련 모달 |

디자인 비교는 `/design/컴포넌트명`으로 접근합니다. 이름 목록은 `src/design/screens.ts`에서 확인할 수 있습니다. 이 경로는 예시 데이터를 고정한 UI 비교용이며 실제 API 검증용이 아닙니다.

## 빌드

```sh
npm ci
npm run build
```

## 브라우저 검사

검증 스크립트는 설치된 Chrome을 headless로 사용합니다. 서버 없이 실행하는 아래 세 검사는 포트 3100에서 임시 서버를 생성하고 검사 후 종료합니다. 같은 포트를 사용하므로 순서대로 실행합니다.

```sh
npm run check:layout
npm run check:navigation
npm run check:controls
```

| 검사 | 범위 |
| --- | --- |
| `check:layout` | 마이페이지·프로필 정렬, 긴 텍스트, 빈 생년월일, 저장. 320/393/1280px |
| `check:navigation` | 본문·목록 스크롤, 방문 기록, 뒤로/앞으로, 새로고침, 스크롤 복원, 모달 닫기 위치·동작. 320/393/1280px |
| `check:controls` | 설정 반복 켜기·끄기, 손잡이 위치, 체크박스 아이콘, 키보드 조작, 로컬 설정 저장. 320/393px |

전체 화면·기본 상호작용 검사는 별도 터미널에서 `npm run dev`를 실행한 상태로 수행합니다.

```sh
npm run check:design
npm run check:interactions
```

기본 주소는 `http://127.0.0.1:3000`입니다. 다른 서버를 검사하려면 이 두 검사에 `VERIFY_BASE_URL` 환경변수를 지정합니다. 결과·스크린샷은 Git 제외된 `.local/`에 저장합니다.

`check:design`은 20개 화면의 이미지 로딩·크기·실행 오류와 320px의 가로 넘침을 확인합니다. `check:interactions`는 화면 이동·로컬 프로필 저장·토글·일기 편집·모달을 확인합니다. 테스트는 격리된 브라우저를 사용합니다.

위 기본 UI 검사는 로컬 저장소 중심입니다. 인증·프로필 기능은 아래 별도 모의 API 검사로 확인합니다.

## 인증·프로필 연동 검사

```sh
npm run check:auth
npm run check:profile-api
```

두 검사는 각각 임시 서버를 사용하므로 순서대로 실행합니다. 실제 백엔드 대신 모의 API로 인가 코드 교환·토큰·쿠키·로그아웃, 로그인 후 프로필 조회, 수정·재조회, 설정 저장 실패 복구를 확인합니다. `check:controls`도 프로필 API를 모의 응답으로 검사합니다. 실제 카카오 계정과 로컬 MySQL을 통한 통합 확인은 [백엔드 연동 가이드](BACKEND_INTEGRATION.md)를 따릅니다.
