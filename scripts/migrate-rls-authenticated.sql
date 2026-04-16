-- RLS 정책 강화: anon → authenticated only
-- Supabase SQL Editor에서 실행

-- 1. 기존 정책 모두 삭제
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2. RLS 활성화 확인 (이미 활성화되어 있으면 무시)
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_members ENABLE ROW LEVEL SECURITY;

-- 3. authenticated 사용자만 CRUD 허용
CREATE POLICY "authenticated_select" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON public.brands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON public.brands FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON public.brands FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select" ON public.members FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON public.members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON public.members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON public.members FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON public.projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON public.projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON public.projects FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select" ON public.project_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON public.project_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON public.project_members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON public.project_members FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select" ON public.schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON public.schedule FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON public.schedule FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON public.schedule FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select" ON public.schedule_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON public.schedule_assignees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON public.schedule_assignees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON public.schedule_assignees FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select" ON public.scenarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON public.scenarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON public.scenarios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON public.scenarios FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select" ON public.scenario_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON public.scenario_schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON public.scenario_schedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON public.scenario_schedules FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select" ON public.attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON public.attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON public.attendance FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON public.attendance FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select" ON public.attendance_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert" ON public.attendance_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update" ON public.attendance_members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete" ON public.attendance_members FOR DELETE TO authenticated USING (true);
