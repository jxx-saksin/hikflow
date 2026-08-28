-- =============================================================================
-- Hikflow — Supabase 스키마 (한 번만 실행)
-- Supabase 콘솔 > SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요.
-- 안전하게 여러 번 실행해도 됩니다(idempotent). 처음 1회면 충분합니다.
--
-- 구성:
--   테이블: allowed_members / profiles / projects / applications / tasks /
--           task_comments / activity_logs
--   보안:   RLS + 허용 명단(allowed_members)에 등록된 이메일만 접근 가능
--   자동화: 로그인 시 profiles 자동생성, 활동 로그 자동 기록(트리거)
-- =============================================================================

-- 필요한 확장 (uuid 생성용) --------------------------------------------------
create extension if not exists pgcrypto;

-- ===========================================================================
-- 0) 허용 명단 (접근 제어의 유일한 기준)
--
--    이 표에 등록된 이메일만 데이터를 읽고 쓸 수 있습니다.
--    명단에 없으면 회사 계정으로 로그인해도 한 줄도 못 가져갑니다.
--
--    ★ 사람 추가/제외는 Supabase 화면에서 이 표의 행만 고치면 됩니다.
--      코드 수정도, 재배포도 필요 없습니다.
-- ===========================================================================
create table if not exists public.allowed_members (
  email    text primary key,
  name     text,
  added_at timestamptz not null default now()
);

-- 로그인한 사람이 명단에 있는지 검사.
-- security definer 라서 RLS를 우회해 명단을 조회할 수 있습니다
-- (본인이 명단에 있는지 여부만 true/false 로 알려주고, 명단 내용은 노출하지 않음).
create or replace function public.is_allowed_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

grant execute on function public.is_allowed_member() to authenticated, anon;

-- ★★★ 팀원 이메일은 이 파일에 넣지 않습니다.
--     이 저장소는 공개(Public)라서 실제 이메일이 노출되기 때문입니다.
--     → 이 스키마를 실행한 뒤, 별도로 아래 형태의 구문을 한 번 더 실행하세요.
--       (로컬 전용 파일 sql/members.local.sql 에 준비돼 있습니다. 깃에 올라가지 않습니다.)
--
--     insert into public.allowed_members (email) values
--       ('someone@your-company.com')
--     on conflict (email) do nothing;
--
--     또는 Supabase 화면에서: Table Editor → allowed_members → Insert row

-- ===========================================================================
-- 1) 테이블
-- ===========================================================================

-- 사용자 프로필 (auth.users 와 1:1, 로그인 시 자동 생성) ----------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text unique not null,
  name       text,
  created_at timestamptz not null default now()
);

-- 프로젝트 ------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  key_points  text[] not null default '{}',   -- 눈에 띄게 표시할 핵심 사항 (선택, 여러 개)
  status      text not null default 'active' check (status in ('active','hold','closed')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 애플리케이션 (프로젝트 하위 계층) -------------------------------------------
-- 업무 입력창에서 앱 이름을 치면 없을 때 자동으로 만들어집니다(get-or-create).
create table if not exists public.applications (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

-- 업무(할 일) ---------------------------------------------------------------
create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,  -- (미사용, 향후 그룹핑용)
  title          text not null,          -- 업무 이름 (카드의 제목)
  description    text,                   -- 설명 (선택)
  assignee_id    uuid references public.profiles(id) on delete set null,  -- (구버전. 지금은 task_assignees 사용)
  due_date       date,
  link           text,
  state          text not null default 'wait' check (state in ('wait','doing','done')),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists tasks_project_idx on public.tasks(project_id);

-- 업무 담당자 (한 업무에 여러 명 지정 가능) ---------------------------------
create table if not exists public.task_assignees (
  task_id    uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);
create index if not exists task_assignees_profile_idx on public.task_assignees(profile_id);

-- 업무 코멘트 ---------------------------------------------------------------
-- 업무 카드를 누르면 열리는 상세 화면에서 팀원들이 의견을 주고받는 곳.
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments(task_id, created_at);

-- 활동 로그 (전부 트리거로 자동 기록, 수동 작성 없음) ------------------------
create table if not exists public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  task_id    uuid,  -- 업무 삭제 후에도 로그는 남도록 FK 걸지 않음
  verb       text not null,  -- 'project_added' | 'task_added' | 'task_moved' | 'task_done'
  meta       jsonb not null default '{}'::jsonb,  -- { title, from, to } 등
  created_at timestamptz not null default now()
);
create index if not exists activity_created_idx on public.activity_logs(created_at desc);

-- ===========================================================================
-- 2) 로그인 시 profiles 자동 생성 (명단에 있는 사람만)
--    명단에 없는 사람이 구글 로그인을 시도해도 프로필이 만들어지지 않습니다.
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_members
    where lower(email) = lower(new.email)
  ) then
    return new;  -- 명단 밖 → 프로필 생성하지 않음
  end if;

  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- 3) 활동 로그 자동 기록 트리거
-- ===========================================================================

-- 프로젝트 개설 → 로그
create or replace function public.log_project_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_logs (actor_id, project_id, verb, meta)
  values (auth.uid(), new.id, 'project_added', jsonb_build_object('name', new.name));
  return new;
end
$$;

drop trigger if exists on_project_added on public.projects;
create trigger on_project_added
  after insert on public.projects
  for each row execute function public.log_project_added();

-- 업무 추가 → 로그
create or replace function public.log_task_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_logs (actor_id, project_id, task_id, verb, meta)
  values (auth.uid(), new.project_id, new.id, 'task_added',
          jsonb_build_object('title', new.title, 'to', new.state));
  return new;
end
$$;

drop trigger if exists on_task_added on public.tasks;
create trigger on_task_added
  after insert on public.tasks
  for each row execute function public.log_task_added();

-- 업무 상태 이동 → 로그 (완료로 이동 시 완료 로그도 추가)
create or replace function public.log_task_moved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state is distinct from old.state then
    new.updated_at := now();
    insert into public.activity_logs (actor_id, project_id, task_id, verb, meta)
    values (auth.uid(), new.project_id, new.id, 'task_moved',
            jsonb_build_object('title', new.title, 'from', old.state, 'to', new.state));
    if new.state = 'done' then
      insert into public.activity_logs (actor_id, project_id, task_id, verb, meta)
      values (auth.uid(), new.project_id, new.id, 'task_done',
              jsonb_build_object('title', new.title));
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists on_task_moved on public.tasks;
create trigger on_task_moved
  before update on public.tasks
  for each row execute function public.log_task_moved();

-- 업무 삭제 → 로그 (삭제는 되돌릴 수 없으므로 기록을 남깁니다)
create or replace function public.log_task_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 프로젝트가 통째로 지워지는 중이면(cascade) 개별 업무 로그는 남기지 않음
  if exists (select 1 from public.projects where id = old.project_id) then
    insert into public.activity_logs (actor_id, project_id, task_id, verb, meta)
    values (auth.uid(), old.project_id, old.id, 'task_deleted',
            jsonb_build_object('title', old.title));
  end if;
  return old;
end
$$;

drop trigger if exists on_task_deleted on public.tasks;
create trigger on_task_deleted
  after delete on public.tasks
  for each row execute function public.log_task_deleted();

-- 업무 내용 수정 → 로그 (상태 변경은 위 log_task_moved 가 따로 기록)
create or replace function public.log_task_edited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.title, new.description, new.due_date, new.link)
     is distinct from
     (old.title, old.description, old.due_date, old.link) then
    insert into public.activity_logs (actor_id, project_id, task_id, verb, meta)
    values (auth.uid(), new.project_id, new.id, 'task_edited',
            jsonb_build_object('title', new.title));
  end if;
  return new;
end
$$;

drop trigger if exists on_task_edited on public.tasks;
create trigger on_task_edited
  after update on public.tasks
  for each row execute function public.log_task_edited();

-- 프로젝트 수정 → 로그
create or replace function public.log_project_edited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.name, new.description, new.status, new.key_points)
     is distinct from (old.name, old.description, old.status, old.key_points) then
    insert into public.activity_logs (actor_id, project_id, verb, meta)
    values (auth.uid(), new.id, 'project_edited', jsonb_build_object('name', new.name));
  end if;
  return new;
end
$$;

drop trigger if exists on_project_edited on public.projects;
create trigger on_project_edited
  after update on public.projects
  for each row execute function public.log_project_edited();

-- 프로젝트 삭제 → 로그
-- (해당 프로젝트의 기존 로그는 cascade 로 함께 지워지므로 project_id 를 비워 남깁니다)
create or replace function public.log_project_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_logs (actor_id, project_id, verb, meta)
  values (auth.uid(), null, 'project_deleted', jsonb_build_object('name', old.name));
  return old;
end
$$;

drop trigger if exists on_project_deleted on public.projects;
create trigger on_project_deleted
  after delete on public.projects
  for each row execute function public.log_project_deleted();

-- 코멘트 작성 → 로그
create or replace function public.log_comment_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  select project_id, title into t from public.tasks where id = new.task_id;
  insert into public.activity_logs (actor_id, project_id, task_id, verb, meta)
  values (auth.uid(), t.project_id, new.task_id, 'comment_added',
          jsonb_build_object('title', t.title));
  return new;
end
$$;

drop trigger if exists on_comment_added on public.task_comments;
create trigger on_comment_added
  after insert on public.task_comments
  for each row execute function public.log_comment_added();

-- ===========================================================================
-- 4) RLS (Row Level Security)
--    명단에 있는 5명은 전원 동일 권한(읽기/쓰기 전부 가능).
--    명단에 없으면(is_allowed_member()=false) 아무것도 못 합니다.
-- ===========================================================================
alter table public.allowed_members enable row level security;
alter table public.profiles       enable row level security;
alter table public.projects       enable row level security;
alter table public.applications   enable row level security;
alter table public.tasks          enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_comments  enable row level security;
alter table public.activity_logs  enable row level security;

-- allowed_members: 명단 자체는 앱에서 못 읽고 못 씁니다.
--   (정책을 하나도 만들지 않으면 RLS가 전부 막습니다.
--    명단 확인은 위 is_allowed_member() 함수만 통해서 이뤄집니다.
--    사람 추가/제외는 Supabase 대시보드에서 직접 하세요.)

-- profiles: 명단 사용자는 전체 조회(담당자 목록 채우기), 본인 것만 수정
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (public.is_allowed_member());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- projects / applications / tasks: 회사 사용자면 전권
drop policy if exists projects_all on public.projects;
create policy projects_all on public.projects
  for all using (public.is_allowed_member()) with check (public.is_allowed_member());

drop policy if exists applications_all on public.applications;
create policy applications_all on public.applications
  for all using (public.is_allowed_member()) with check (public.is_allowed_member());

drop policy if exists tasks_all on public.tasks;
create policy tasks_all on public.tasks
  for all using (public.is_allowed_member()) with check (public.is_allowed_member());

-- task_assignees: 명단 사용자는 자유롭게 담당자를 지정/해제할 수 있음
drop policy if exists assignees_all on public.task_assignees;
create policy assignees_all on public.task_assignees
  for all using (public.is_allowed_member()) with check (public.is_allowed_member());

-- task_comments: 회사 사용자는 모두 읽고 쓸 수 있지만,
--                수정·삭제는 "본인이 쓴 코멘트"만 가능(남의 말은 못 지움)
drop policy if exists comments_select on public.task_comments;
create policy comments_select on public.task_comments
  for select using (public.is_allowed_member());

drop policy if exists comments_insert on public.task_comments;
create policy comments_insert on public.task_comments
  for insert with check (public.is_allowed_member() and author_id = auth.uid());

drop policy if exists comments_update_own on public.task_comments;
create policy comments_update_own on public.task_comments
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists comments_delete_own on public.task_comments;
create policy comments_delete_own on public.task_comments
  for delete using (author_id = auth.uid());

-- activity_logs: 조회만 가능(쓰기는 위 트리거가 담당)
drop policy if exists activity_select on public.activity_logs;
create policy activity_select on public.activity_logs
  for select using (public.is_allowed_member());

-- ===========================================================================
-- 5) 실시간(Realtime) 활성화 — 5명이 같은 보드를 실시간으로 공유
--    (여러 번 실행해도 안전하도록 이미 추가된 테이블은 건너뜀)
-- ===========================================================================
do $$
declare
  t text;
begin
  foreach t in array array['projects','tasks','task_assignees','task_comments','activity_logs'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- 끝. 오류 없이 실행되면 백엔드 준비 완료입니다.
