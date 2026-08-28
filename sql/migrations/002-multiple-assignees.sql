-- =============================================================================
-- 002 · 한 업무에 담당자를 여러 명 지정할 수 있게
--
-- 기존에는 업무마다 담당자가 한 명(tasks.assignee_id)이었습니다.
-- 이제 별도 표(task_assignees)로 옮겨 여러 명을 넣고 뺄 수 있게 합니다.
--
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.
-- =============================================================================

-- 1) 담당자 표
create table if not exists public.task_assignees (
  task_id    uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);
create index if not exists task_assignees_profile_idx on public.task_assignees(profile_id);

-- 2) 접근 권한 (명단에 있는 사람만)
alter table public.task_assignees enable row level security;

drop policy if exists assignees_all on public.task_assignees;
create policy assignees_all on public.task_assignees
  for all using (public.is_allowed_member()) with check (public.is_allowed_member());

-- 3) 기존에 지정돼 있던 담당자를 새 표로 옮김 (원본은 지우지 않고 보존)
insert into public.task_assignees (task_id, profile_id)
select id, assignee_id
from   public.tasks
where  assignee_id is not null
on conflict do nothing;

-- 4) 수정 로그 트리거에서 assignee_id 제외
--    (담당자는 이제 별도 표에서 바뀌므로 여기서는 감지되지 않습니다)
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

-- 5) 실시간 동기화 대상에 추가
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_assignees'
  ) then
    alter publication supabase_realtime add table public.task_assignees;
  end if;
end
$$;

-- 결과 확인
select t.title, p.name as assignee
from   public.tasks t
left join public.task_assignees ta on ta.task_id = t.id
left join public.profiles p        on p.id = ta.profile_id
order by t.created_at;
