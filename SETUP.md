# Hikflow 세팅 가이드

계정·키 발급은 대신 해드릴 수 없어서, 화면 클릭 순서까지 짚어드립니다.
순서대로만 따라오면 됩니다. 중간에 나오는 **URL·키는 메모장에 잠깐 붙여두세요.**

전체 흐름: **① Supabase 만들기 → ② 스키마 실행 → ③ GitHub 계정·저장소·Pages → ④ 구글 로그인 연결 → ⑤ 키 입력하고 마무리**

> 순서는 바꿔도 됩니다. ③(GitHub)은 다른 단계와 무관하게 먼저 해도 되고,
> ④(구글 로그인)는 ③에서 나온 앱 주소가 있어야 설정할 수 있습니다.

> ⚠ **이 폴더가 Dropbox·iCloud 안에 있다면**, 동기화가 `.git` 폴더를 건드리면서
> 저장소가 깨질 수 있습니다. 프로젝트 폴더에서 아래를 1회 실행해 제외해 두세요:
> ```bash
> xattr -w com.dropbox.ignored 1 .git
> ```

---

## ① Supabase 프로젝트 만들기

1. https://supabase.com 접속 → **Start your project** → GitHub 계정 등으로 로그인.
2. **New project** 클릭.
   - Organization: 없으면 하나 만들기(회사 이름 등).
   - **Name**: `hikflow`
   - **Database Password**: 강한 비밀번호 생성 → **어딘가 저장**(나중에 DB 직접 접속 시 필요, 앱엔 안 씀).
   - **Region**: `Northeast Asia (Seoul)` 또는 `Tokyo` (한국에서 가장 빠름).
   - **Create new project** → 1~2분 기다립니다.

---

## ② 데이터베이스 스키마 실행

1. 왼쪽 메뉴 **SQL Editor** → **New query**.
2. 이 저장소의 `sql/schema.sql` **전체 내용을 복사**해 붙여넣습니다.
3. ⚠ 붙여넣은 SQL 상단의 **허용 명단(`insert into public.allowed_members`)** 에서
   예시 이메일 5개를 **실제 팀원 회사 지메일**로 바꾸세요. 이 명단에 있는 사람만 들어올 수 있습니다.
4. 오른쪽 아래 **Run** (또는 ⌘/Ctrl+Enter).
5. "Success. No rows returned" 가 뜨면 완료. (에러가 나면 그 메시지를 저에게 알려주세요.)

> 이걸로 테이블, 접근권한(RLS), 활동로그 자동기록 트리거, 실시간까지 전부 세팅됩니다.

### 나중에 팀원 추가·제외하기

코드 수정이나 재배포 없이 **Supabase 화면에서 명단만 고치면** 됩니다:

**Table Editor → `allowed_members`** 에서
- 추가: **Insert row** → 이메일 입력 → 저장
- 제외: 해당 행 선택 → 삭제 (그 사람은 다음 접속부터 바로 차단됩니다)

---

## ③ GitHub 계정 · 저장소 · Pages

구글 로그인 설정에 **앱 주소**가 필요해서 배포를 먼저 합니다.

### 3-1. GitHub 계정 만들기

회사 GitHub 조직을 쓰더라도 **개인 계정이 먼저 있어야 합니다.**
GitHub는 조직용 로그인이 따로 없고, 개인 계정으로 로그인한 뒤 조직에 참여하는 구조입니다.

1. https://github.com/signup 접속
2. **Email** — 회사 지메일 입력 → Continue
3. **Password** — 15자 이상, 또는 8자 이상이면서 숫자·소문자 포함 → Continue
4. **Username** — ⚠ **이게 앱 주소에 그대로 들어갑니다.**
   `https://<username>.github.io/hikflow/` 형태가 되니 신중히 정하세요.
   (영문·숫자·하이픈만 가능. 예: `studiohik`, `hik-z`)
5. 이메일 수신 여부(`y`/`n`) → Continue
6. 사람 확인 퍼즐 → **Create account**
7. 회사 지메일로 온 **8자리 인증 코드** 입력
8. 설문(어떤 용도로 쓰나요 등)은 건너뛰어도 됩니다 → **Free** 플랜 선택

### 3-2. 2단계 인증(2FA) 설정 — 건너뛸 수 없습니다

GitHub는 코드를 올리는 계정에 2FA를 필수로 요구합니다. 가입 후 안내가 뜨면:

- **인증 앱** 방식 권장 (Google Authenticator, 1Password, iOS 기본 암호 앱 등)
- 또는 **SMS** 방식
- ⚠ 화면에 나오는 **복구 코드(recovery codes)를 반드시 저장**하세요.
  휴대폰을 잃어버리면 이것 없이는 계정을 못 찾습니다.

### 3-3. 저장소 만들기

1. https://github.com/new 접속
2. **Repository name**: `hikflow`
3. **Public / Private** 선택 — 아래 표 참고
4. ⚠ **Add a README file 체크하지 마세요.** (이미 파일이 있어서 충돌합니다)
   `.gitignore`, `license`도 **None** 그대로.
5. **Create repository**

| | Public | Private |
|---|---|---|
| GitHub Pages | 무료로 됨 | **유료 플랜 필요** (Pro/Team 이상) |
| 코드 공개 | 누구나 볼 수 있음 | 팀만 |
| 데이터 안전성 | 동일 — 코드엔 공개돼도 되는 anon 키만 들어가고, 실제 데이터는 Supabase의 명단+RLS가 보호 |

> 무료로 쓰려면 **Public**이어야 합니다. 코드가 공개돼도 데이터는 안전하지만,
> 사내 코드 공개가 회사 정책상 곤란하면 Private + 유료 플랜을 택하세요.

### 3-4. 인증 도구 설치 (한 번만)

GitHub는 이제 비밀번호로 코드를 올릴 수 없습니다. 가장 간단한 방법은 GitHub CLI입니다.

```bash
brew install gh
```

Homebrew가 없다면 먼저:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

설치 후 로그인 (브라우저가 열립니다):

```bash
gh auth login
```

선택지는 순서대로 → `GitHub.com` → `HTTPS` → `Y`(git 인증에 사용) → `Login with a web browser`
→ 화면의 **8자리 코드**를 복사 → Enter → 브라우저에서 붙여넣고 **Authorize**

### 3-5. 파일 올리기

```bash
git add .
git commit -m "Hikflow initial commit"
git branch -M main
git remote add origin https://github.com/<username>/hikflow.git
git push -u origin main
```

`<username>`은 3-1에서 정한 이름으로 바꾸세요.

### 3-6. Pages 켜기

1. 저장소 → **Settings** → 왼쪽 메뉴 **Pages**
2. **Source**: `Deploy from a branch`
3. **Branch**: `main` / `/ (root)` → **Save**
4. 1~2분 뒤 상단에 주소가 뜹니다:
   `https://<username>.github.io/hikflow/`
   → 이 **앱 주소를 메모**해 두세요. ④에서 씁니다.

---

## ④ 구글 로그인 연결

### 4-1. Supabase에서 콜백 주소 복사
1. Supabase 왼쪽 **Authentication → Sign In / Providers → Google**.
2. **Callback URL (for OAuth)** 값을 복사 → 메모.
   형식: `https://<프로젝트ref>.supabase.co/auth/v1/callback`

### 4-2. Google Cloud에서 OAuth 자격증명 만들기
1. https://console.cloud.google.com 접속 → 상단에서 새 프로젝트 생성(예: `hikflow`).
2. **API 및 서비스 → OAuth 동의 화면**:
   - **회사가 Google Workspace(회사 지메일이 Workspace)라면 → User Type을 `내부(Internal)`** 로 선택하세요.
     이것만으로 **회사 도메인 계정만** 로그인 가능해집니다(가장 확실한 방법).
   - Workspace가 아니라면 `외부(External)` 선택 → 나중에 도메인 제한은 앱(RLS)이 담당합니다.
   - 앱 이름 `Hikflow`, 지원 이메일 입력 후 저장.
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**:
   - 애플리케이션 유형: **웹 애플리케이션**
   - **승인된 리디렉션 URI**에 4-1에서 복사한 **Supabase Callback URL** 붙여넣기.
   - 만들기 → **클라이언트 ID**와 **클라이언트 보안 비밀번호(Secret)** 를 복사 → 메모.

### 4-3. Supabase에 구글 정보 입력
1. 다시 Supabase **Authentication → Providers → Google**:
   - **Enable** 켜기.
   - **Client ID**, **Client Secret** 붙여넣기 → **Save**.

### 4-4. 앱 주소를 Supabase에 등록
1. **Authentication → URL Configuration**:
   - **Site URL**: ③에서 얻은 앱 주소 (`https://<조직명>.github.io/<저장소명>/`)
   - **Redirect URLs**에 **Add URL** 로 아래 둘을 추가:
     - `https://<조직명>.github.io/<저장소명>/`  ← 실제 앱
     - `http://localhost:5173`  ← 로컬 테스트용(선택)
   - **Save**.

---

## ⑤ 키 입력하고 올리기(마무리)

1. `js/config.js` 를 열어 세 줄을 채웁니다:
   - `SUPABASE_URL` : Supabase **Project Settings → API → Project URL**
   - `SUPABASE_ANON_KEY` : 같은 화면의 **anon public** 키
   - `ALLOWED_DOMAIN` : 회사 지메일 도메인(@ 포함, 예 `@hxx.kr`)
     — 구글 로그인 창 편의용 힌트일 뿐입니다. 실제 접근 제어는 ②의 허용 명단이 담당합니다.
2. 저장 후 GitHub에 올립니다:

```bash
git add .
git commit -m "Configure Supabase keys"
git branch -M main
git remote add origin https://github.com/<조직명>/<저장소명>.git
git push -u origin main
```

3. 1~2분 뒤 앱 주소로 접속 → **구글로 로그인** → 보드가 뜨면 성공! 🎉

---

## 다 되면 확인할 것

- [ ] 회사 지메일로 로그인이 되고, **개인 지메일로는 거부**되는지.
- [ ] 프로젝트 추가 → 업무 추가 → 카드 드래그로 상태 이동이 되는지.
- [ ] **활동 로그** 탭에 방금 한 일이 자동으로 남는지.
- [ ] 팀원 5명이 각자 **한 번씩 로그인**해야 업무 담당자 목록에 이름이 뜹니다.
- [ ] 두 사람이 동시에 열어두고 한쪽에서 카드를 옮기면 **다른 쪽 화면도 자동 갱신**되는지(실시간).

## 자주 나는 오류

- **로그인했더니 “접근 권한 없음”**: 그 이메일이 `allowed_members` 명단에 없는 경우입니다.
  Supabase → Table Editor → `allowed_members` 에서 철자까지 정확히 등록됐는지 확인하세요.
- **`redirect_uri_mismatch`**: 구글 자격증명의 리디렉션 URI가 Supabase Callback URL과 정확히 같아야 합니다.
- **로그인 자체가 안 뜸**: Supabase `URL Configuration` 의 Redirect URLs 에 앱 주소가 등록됐는지 확인.
- **데이터가 안 보임**: 브라우저 콘솔(개발자도구)에 뜬 오류 메시지를 저에게 알려주세요.
