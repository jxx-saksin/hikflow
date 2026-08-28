-- =============================================================================
-- 001 · 업무에 "설명(description)" 칸 추가
--
-- 배경: 입력 항목을 [Task 이름] + [설명(선택)] 구조로 바꿨습니다.
--       기존의 Application 칸은 더 이상 쓰지 않습니다.
--
-- Supabase SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.
-- =============================================================================

alter table public.tasks
  add column if not exists description text;

-- 기존에 만들어 둔 업무가 있다면, 예전 구조(애플리케이션 이름 + 긴 내용)를
-- 새 구조(업무 이름 + 설명)로 옮깁니다.
--   예전: application.name = "Booking UI",  title = "캘린더 드래그 구현"
--   이후: title = "Booking UI",             description = "캘린더 드래그 구현"
-- 애플리케이션이 지정돼 있던 업무에만 적용됩니다.
update public.tasks t
set    description = t.title,
       title       = a.name
from   public.applications a
where  t.application_id = a.id
  and  t.description is null;

-- 수정 로그 트리거가 새 칸(description)도 감지하도록 갱신
create or replace function public.log_task_edited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.title, new.description, new.assignee_id, new.due_date, new.link)
     is distinct from
     (old.title, old.description, old.assignee_id, old.due_date, old.link) then
    insert into public.activity_logs (actor_id, project_id, task_id, verb, meta)
    values (auth.uid(), new.project_id, new.id, 'task_edited',
            jsonb_build_object('title', new.title));
  end if;
  return new;
end
$$;

-- 결과 확인
select title, description, state from public.tasks order by created_at;
