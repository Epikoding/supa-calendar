-- ============================================
-- BX Calendar v3 — Row Level Security
-- DDL 실행 후 이 파일을 Supabase SQL Editor에서 실행
-- ============================================
-- 5명 이하 내부 팀 전용이므로 간단한 정책:
--   - authenticated 사용자: 전체 CRUD
--   - anon 사용자: 읽기만 허용 (개발 중 편의, 나중에 제거 가능)
-- ============================================

-- 모든 테이블에 RLS 활성화
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_members ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 인증된 사용자 — 전체 접근 (SELECT, INSERT, UPDATE, DELETE)
-- ============================================

-- brands
CREATE POLICY "Authenticated users can read brands"
  ON brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert brands"
  ON brands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update brands"
  ON brands FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete brands"
  ON brands FOR DELETE TO authenticated USING (true);

-- members
CREATE POLICY "Authenticated users can read members"
  ON members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert members"
  ON members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update members"
  ON members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete members"
  ON members FOR DELETE TO authenticated USING (true);

-- projects
CREATE POLICY "Authenticated users can read projects"
  ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert projects"
  ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update projects"
  ON projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete projects"
  ON projects FOR DELETE TO authenticated USING (true);

-- project_roles
CREATE POLICY "Authenticated users can read project_roles"
  ON project_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_roles"
  ON project_roles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update project_roles"
  ON project_roles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete project_roles"
  ON project_roles FOR DELETE TO authenticated USING (true);

-- project_members
CREATE POLICY "Authenticated users can read project_members"
  ON project_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_members"
  ON project_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update project_members"
  ON project_members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete project_members"
  ON project_members FOR DELETE TO authenticated USING (true);

-- schedule
CREATE POLICY "Authenticated users can read schedule"
  ON schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert schedule"
  ON schedule FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update schedule"
  ON schedule FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete schedule"
  ON schedule FOR DELETE TO authenticated USING (true);

-- schedule_assignees
CREATE POLICY "Authenticated users can read schedule_assignees"
  ON schedule_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert schedule_assignees"
  ON schedule_assignees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update schedule_assignees"
  ON schedule_assignees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete schedule_assignees"
  ON schedule_assignees FOR DELETE TO authenticated USING (true);

-- attendance
CREATE POLICY "Authenticated users can read attendance"
  ON attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert attendance"
  ON attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update attendance"
  ON attendance FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete attendance"
  ON attendance FOR DELETE TO authenticated USING (true);

-- attendance_members
CREATE POLICY "Authenticated users can read attendance_members"
  ON attendance_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert attendance_members"
  ON attendance_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update attendance_members"
  ON attendance_members FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete attendance_members"
  ON attendance_members FOR DELETE TO authenticated USING (true);

-- scenarios
CREATE POLICY "Authenticated users can read scenarios"
  ON scenarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert scenarios"
  ON scenarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update scenarios"
  ON scenarios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete scenarios"
  ON scenarios FOR DELETE TO authenticated USING (true);

-- scenario_schedules
CREATE POLICY "Authenticated users can read scenario_schedules"
  ON scenario_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert scenario_schedules"
  ON scenario_schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update scenario_schedules"
  ON scenario_schedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete scenario_schedules"
  ON scenario_schedules FOR DELETE TO authenticated USING (true);

-- keyword_highlights
ALTER TABLE keyword_highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read keyword_highlights"
  ON keyword_highlights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert keyword_highlights"
  ON keyword_highlights FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update keyword_highlights"
  ON keyword_highlights FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete keyword_highlights"
  ON keyword_highlights FOR DELETE TO authenticated USING (true);

-- project_links
ALTER TABLE project_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read project_links"
  ON project_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_links"
  ON project_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update project_links"
  ON project_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete project_links"
  ON project_links FOR DELETE TO authenticated USING (true);

-- ============================================
-- 익명(anon) 사용자 — 읽기만 허용 (개발 중 편의)
-- 프로덕션 전환 시 아래 정책 삭제 권장
-- ============================================
CREATE POLICY "Anon users can read all tables"
  ON brands FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read members"
  ON members FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read projects"
  ON projects FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read project_roles"
  ON project_roles FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read project_members"
  ON project_members FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read schedule"
  ON schedule FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read schedule_assignees"
  ON schedule_assignees FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read scenarios"
  ON scenarios FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read scenario_schedules"
  ON scenario_schedules FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read attendance"
  ON attendance FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read attendance_members"
  ON attendance_members FOR SELECT TO anon USING (true);
