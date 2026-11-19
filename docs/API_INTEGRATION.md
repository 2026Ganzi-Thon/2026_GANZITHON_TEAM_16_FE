# API 연동 현황 (2026-11-17)

기준: 백엔드 `develop` `5b2c67b`의 컨트롤러·DTO. 로그인(Access Token 있음) 상태에서는 실제 API를, 로그인하지 않은 미리보기에서는 기존 로컬 데이터를 사용합니다.

## 연동한 화면

| 화면 | API |
| --- | --- |
| 소셜 로그인 | POST `/auth/kakao`, `/auth/google`, `/auth/naver`. 제공자별 인가 요청·state 검증·콜백 코드 교환·토큰 저장·프로필 갱신 |
| 대화 `/chat` | `POST/GET /chat-sessions`, `GET/PATCH /chat-sessions/{id}`, `POST …/messages`, `PATCH …/messages/{id}` |
| 대화 시작 캐릭터 | My 캐릭터에서 고른 보유 캐릭터, 없으면 `GET /characters`의 첫 보유 캐릭터 UUID |
| 보관함 `/archive` | `GET /chat-sessions` (제목·요약이 null이면 "제목 없음") |
| 보관함 대화 삭제 | 확인 후 `DELETE /chat-sessions/{id}`. 성공 또는 이미 삭제된 대화만 목록에서 제거하고, 삭제한 대화가 현재 진행 중이면 재진입 정보를 정리합니다. 생성된 일기는 보존합니다. |
| AI 일기 생성 | 5왕복 후 대화 종료(`PATCH {action:END}`) → `PUT /chat-sessions/{id}/diary-draft?entryDate=` → 작성 화면 |
| AI 일기 재시도 | 종료된 5왕복 이상 대화에서도 생성 버튼 유지. 실패 후 새로고침·보관함 재진입으로 재시도하며, 이미 저장된 일기는 상세를 엽니다. |
| 과거 일기 추천·비교 | 사용자가 `GET /chat-sessions/{id}/diary-suggestions?messageId=`로 후보 요청 → 일기 선택·동의 → `POST /chat-sessions/{id}/diary-references`로 비교 답변 저장 |
| 연결 일기 열기 | 대화 조회 응답의 `diaryReferences`를 카드로 표시하고 일기 상세로 이동. 새로고침·보관함 재진입에도 복원 |
| 일기 작성·수정 `/diary/write[?id=]` | 새 글 `POST /diaries`, 초안·수정 `PATCH /diaries/{id}` (`save:true`) |
| 일기 상세 `/diary/detail?id=` | `GET /diaries/{id}` (사진 첨부가 없으면 예시 사진 숨김) |
| 저장된 일기의 감정 | `GET /emotion-types`, `POST /diaries/{id}/emotion-suggestions`, `PUT /diaries/{id}/emotions` |
| 오늘의 기록 `/diary` | `GET /diaries` 목록, 더 보기 |
| 마음 캘린더 `/calendar` | 월별 `GET /diaries?from&to` + `GET /calendar?month` 감정 색, 월 이동, 날짜 클릭 시 일기 |
| 월간 마음 회고 | 캘린더에서 열기 → `GET /calendar/recap?month`와 `GET /emotion-types`. 월 선택·감정 횟수·AI 회고·빈 달·오류 재시도 |
| 본문 수정 후 감정 안내 | 확정 감정이 있는 일기의 본문 변경 시 저장 전 안내. 저장 응답에서 초기화를 확인하면 상세에서 재선택 안내 및 감정 선택 팝업 연결 |
| 기록 선택 삭제 | `GET /diaries` + `POST /diaries/bulk-delete` |
| 모든 기록 삭제 | `DELETE /me/records` |
| 계정 삭제 (내 정보) | 확인 창 후 `DELETE /auth/withdraw`, 로그아웃 |

오류는 서버 `error.message`를 안내합니다. 대화 삭제·일기 생성·과거 일기 추천/비교는 해당 화면에 오류를 유지해 재시도할 수 있습니다. 과거 일기 추천은 프로필의 usePastDiaries가 켜진 로그인 사용자와 진행 중인 대화에서만 표시합니다. 후보 조회만으로 일기가 연결되지는 않습니다. 비교 답변은 AI 메시지만 추가하며 5왕복 진행도를 올리지 않습니다.

## 남은 것

- **감정 UI 연동 완료**: 저장된 일기 상세의 ‘감정 기록하기’에서 복수 감정·대표 감정을 선택하고 확정합니다. AI 추천은 버튼으로 요청하며 확정 전에는 저장하지 않습니다. 추천 실패 시 직접 선택할 수 있고, 확정 실패 시 재시도할 수 있습니다. 미확정 일기는 중립 색으로 표시합니다.
- **사진 첨부**: 명세의 multipart 업로드는 서버 구현을 확인한 뒤 연결합니다.
- **통계·주간 기록**: 마이페이지는 목록 API로 실제 통계를 집계하고 홈·오늘의 기록은 실제 주간 일기를 표시합니다. 구매·포인트 API는 별도 범위입니다.
- **소셜 로그인 실계정 검증**: 구글·네이버 UI/API 연결은 구현했으며 각 제공자의 실제 클라이언트 ID·콜백 등록·동의 화면 및 백엔드 설정을 맞춘 뒤 실계정 검증이 필요합니다. [설정 가이드](SOCIAL_LOGIN.md)를 참고하세요.
- **토큰 자동 재발급**: 보호 API의 401에 공통 갱신과 한 번의 재시도를 적용했습니다. 실패하면 로그인으로 이동합니다. 자세한 조건·검증 범위는 `docs/AUTH.md`를 참고하세요.

## 검증

`npm run check:record-api`가 모의 백엔드로 대화 5왕복·새로고침 복원·AI 초안 저장·직접 작성·목록·캘린더·선택/전체 삭제·탈퇴 확인·미리보기 분리를 확인합니다. 실제 백엔드·실계정으로는 아직 확인하지 않았습니다.

감정 기능은 백엔드 `develop` `35a212f`의 API 계약을 기준으로 연결했습니다. `check:diary-emotions`의 모의 API 검사와 별도로, 격리된 MySQL DB·실제 백엔드·실제 발급 인증 쿠키를 사용해 감정 조회, 수동 확정, 새로고침 복원, 캘린더 대표 색 반영을 확인했습니다. AI 비활성 상태의 추천 실패 복구도 확인했습니다. 외부 AI의 추천 성공은 모의 응답으로만 검증했습니다.

대화 개선은 `check:chat-delete`, `check:chat-improvements`로 모의 API 브라우저 검증을 수행합니다. 외부 AI 추천·비교 성공과 운영 데이터 변경은 이 검사에 포함하지 않습니다. 과거 일기 추천의 빈 목록은 관련 일기 없음뿐 아니라 서버 AI 추천 실패에서도 반환될 수 있습니다.

월간 회고·감정 재확정 안내는 `check:monthly-recap`으로 모의 API 검증을 수행합니다. 회고는 열기 전에는 요청하지 않으며, 동일한 캘린더 방문에서 조회한 월의 결과는 재사용합니다. 감정 이름 재조회는 AI 회고를 재요청하지 않습니다. 감정 재확정 필요 ID는 계정별 sessionStorage에 기록해 새로고침 후에도 안내하되, 다른 기기나 브라우저로 이전되지는 않습니다. 실제 외부 AI 월간 회고 성공은 별도 확인이 필요합니다.
