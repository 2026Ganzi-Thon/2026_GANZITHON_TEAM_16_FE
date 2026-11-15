# API 연동 현황 (2026-11-14)

기준: 백엔드 `develop` `289b95c`의 컨트롤러·DTO. 로그인(Access Token 있음) 상태에서는 실제 API를, 로그인하지 않은 미리보기에서는 기존 로컬 데이터를 사용합니다.

## 연동한 화면

| 화면 | API |
| --- | --- |
| 대화 `/chat` | `POST/GET /chat-sessions`, `GET/PATCH /chat-sessions/{id}`, `POST …/messages`, `PATCH …/messages/{id}` |
| 대화 시작 캐릭터 | My 캐릭터에서 고른 보유 캐릭터, 없으면 `GET /characters`의 첫 보유 캐릭터 UUID |
| 보관함 `/archive` | `GET /chat-sessions` (제목·요약이 null이면 "제목 없음") |
| AI 일기 생성 | 5왕복 후 대화 종료(`PATCH {action:END}`) → `PUT /chat-sessions/{id}/diary-draft?entryDate=` → 작성 화면 |
| 일기 작성·수정 `/diary/write[?id=]` | 새 글 `POST /diaries`, 초안·수정 `PATCH /diaries/{id}` (`save:true`) |
| 일기 상세 `/diary/detail?id=` | `GET /diaries/{id}` (사진 첨부가 없으면 예시 사진 숨김) |
| 오늘의 기록 `/diary` | `GET /diaries` 목록, 더 보기 |
| 마음 캘린더 `/calendar` | 월별 `GET /diaries?from&to` + `GET /calendar?month` 감정 색, 월 이동, 날짜 클릭 시 일기 |
| 기록 선택 삭제 | `GET /diaries` + `POST /diaries/bulk-delete` |
| 모든 기록 삭제 | `DELETE /me/records` |
| 계정 삭제 (내 정보) | 확인 창 후 `DELETE /auth/withdraw`, 로그아웃 |

오류는 서버 `error.message`를 화면 하단 안내로 보여 줍니다.

## 남은 것

- **감정 확정 UI**: 감정 추천·확정 API는 있지만 Figma에 화면이 없어 연결하지 않았습니다. 캘린더 감정 색은 확정된 일기만 서버 색으로, 나머지는 기본 색으로 표시합니다.
- **사진 첨부**: 명세의 multipart 업로드는 서버 구현을 확인한 뒤 연결합니다.
- **통계·구매**: 백엔드 보류. 메인·My 모우의 숫자와 "이번주 기록"은 예시입니다.
- **토큰 자동 재발급**: 401 시 재발급·재시도는 별도 작업입니다.

## 검증

`npm run check:record-api`가 모의 백엔드로 대화 5왕복·새로고침 복원·AI 초안 저장·직접 작성·목록·캘린더·선택/전체 삭제·탈퇴 확인·미리보기 분리를 확인합니다. 실제 백엔드·실계정으로는 아직 확인하지 않았습니다.
