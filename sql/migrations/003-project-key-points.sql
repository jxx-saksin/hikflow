-- =============================================================================
-- 003 · 프로젝트에 "키포인트(key points)" 추가
--
-- 프로젝트 화면 제목 아래에 눈에 띄게 표시할 핵심 사항입니다.
-- 선택 항목이고, 여러 개를 넣을 수 있습니다.
--
-- Supabase SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.
-- =============================================================================

alter table public.projects
  add column if not exists key_points text[] not null default '{}';

-- 프로젝트 수정 로그가 키포인트 변경도 감지하도록 갱신
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

-- 결과 확인
select name, description, key_points from public.projects order by created_at;
