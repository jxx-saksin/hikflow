# Hikflow — 팀 업무 보드

사내 팀(5인)이 함께 쓰는 업무 관리(투두/칸반) 웹앱.
프로젝트 → 애플리케이션 → 업무 3단 구조, 칸반(대기/진행중/완료) 드래그앤드롭, 활동 로그 자동 기록.

- **프론트엔드**: 순수 정적 HTML/JS (빌드 도구 없음) → GitHub Pages 배포
- **인증**: 구글 OAuth — Supabase Auth. 허용 명단(`allowed_members`)에 등록된 팀원만 접근 가능
- **데이터/활동로그**: Supabase (Postgres + RLS + Realtime)

> GitHub는 **호스팅만** 담당하고, 데이터·인증은 전부 Supabase에 있습니다.
> (저장소 쓰기 토큰 노출 위험을 피하려는 의도적 분리)

## 폴더 구조

```
index.html          화면 마크업 + 로그인 게이트
css/styles.css      스타일
js/config.js        ★ Supabase 키를 넣는 단 하나의 파일
js/supabase.js      Supabase 클라이언트 생성
js/store.js         데이터 계층(인증 + CRUD). 화면은 이 함수들만 호출
js/mock-store.js    프로토타입용 샘플 데이터 (store.js 와 같은 인터페이스)
js/app.js           화면 렌더/이벤트
sql/schema.sql      Supabase에 한 번 실행하는 스키마(테이블·권한·트리거)
SETUP.md            처음 세팅 단계별 가이드 (Supabase·구글·배포)
teamboard-prototype.html   원본 프로토타입(참고용, 실제 앱과 무관)
```

## 처음 세팅

[SETUP.md](SETUP.md) 를 순서대로 따라 하세요. 요약:

1. Supabase 프로젝트 생성 → `sql/schema.sql` 실행
2. 구글 OAuth 앱 만들고 Supabase에 연결
3. `js/config.js` 에 URL·anon 키 입력
4. GitHub에 올리고 Pages 켜기

## 두 가지 모드

앱은 `js/config.js` 의 Supabase 키 유무에 따라 **자동으로** 모드를 고릅니다.

| | 프로토타입 모드 | 실서비스 모드 |
|---|---|---|
| 조건 | 키 미입력 (지금 상태) | 키 입력 완료 |
| 데이터 | 샘플 (`js/mock-store.js`, 새로고침 시 초기화) | Supabase (`js/store.js`) |
| 로그인 | 버튼 누르면 바로 입장 | 구글 회사 지메일 |

두 파일은 함수 이름·모양이 같아서 **화면 코드는 양쪽에서 그대로 동작**합니다.
즉 지금 프로토타입을 다듬는 작업이 그대로 실제 제품에 반영됩니다.

## 로컬에서 열어보기

`index.html`은 ES 모듈을 쓰므로 `file://`로 바로 열면 안 되고 로컬 서버가 필요합니다.

```bash
python3 -m http.server 5173
```

그다음 브라우저에서 `http://localhost:5173` 접속. (구글 로그인을 로컬에서 시험하려면
Supabase의 Redirect URL에 `http://localhost:5173` 도 등록해야 합니다 — SETUP.md 참고.)
