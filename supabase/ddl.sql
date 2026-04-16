-- ============================================
-- BX Calendar v3 — Database Schema
-- Supabase SQL Editor에서 실행
-- ============================================

-- brands — 브랜드(클라이언트) 마스터
-- 각 클라이언트사를 관리하는 테이블. code는 ACME, BLUE 같은 대문자 약어.
CREATE TABLE brands (
  id          SERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,          -- 대문자 약어: ACME, BLUE, GREEN
  name        TEXT NOT NULL,                 -- 풀네임
  drive_root  TEXT,                          -- Drive 상위 폴더명
  color       TEXT,                          -- 헥스 컬러 (#E31837)
  sort_order  INTEGER DEFAULT 0,            -- 캘린더뷰 정렬 순서
  calendar_id TEXT,                          -- 구글 캘린더 ID (자동 생성)
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- members — 팀원 마스터
-- 우리 팀 구성원 정보. active=FALSE로 퇴사 처리 (행 삭제 금지).
CREATE TABLE members (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,                 -- 풀네임
  name_short  TEXT UNIQUE NOT NULL,          -- 단축 이름 (수진)
  role        TEXT,                          -- PM, 시니어 디자이너 등
  slack_id    TEXT,
  email       TEXT,
  active      BOOLEAN DEFAULT TRUE,          -- 퇴사 시 FALSE (행 삭제 금지)
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- projects — 프로젝트 마스터
-- 각 브랜드에 속하는 프로젝트. parent_id로 하위 프로젝트 표현 가능.
CREATE TABLE projects (
  id          SERIAL PRIMARY KEY,
  brand_id    INTEGER NOT NULL REFERENCES brands(id),
  parent_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  drive_path  TEXT,
  date_start  DATE,
  date_end    DATE,
  status      TEXT DEFAULT '진행중' CHECK (status IN ('진행전', '진행중', '보류', '완료', '드랍')),
  settled     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_no_self_parent CHECK (parent_id IS NULL OR parent_id != id)
);

-- project_roles — 프로젝트 역할 마스터 (동적 역할 시스템)
-- 기존에 하드코딩되어 있던 designer/pm 2개 역할을 설정 UI에서 N개로 확장 가능하게 변경.
-- key는 project_members.role 의 FK 타깃. is_active=FALSE 로 soft delete.
CREATE TABLE project_roles (
  id          SERIAL PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,          -- 프로그램용 식별자 (designer, pm, qa ...)
  label       TEXT NOT NULL,                 -- 표시 라벨 (디자이너, PM ...)
  color       TEXT,                          -- 헥스 컬러 (#3b82f6)
  sort_order  INTEGER NOT NULL DEFAULT 0,    -- 설정/범례/배지 표시 순서
  is_active   BOOLEAN NOT NULL DEFAULT TRUE, -- soft delete 토글 (FALSE = 신규 배정 숨김)
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 초기 시드 — 기존 CHECK 값과 동일 (마이그레이션 호환)
INSERT INTO project_roles (key, label, color, sort_order) VALUES
  ('designer', '디자이너', '#3b82f6', 1),
  ('pm',       'PM',       '#0ea5e9', 2);

-- project_members — 프로젝트 ↔ 멤버 연결 (project_roles.key FK)
-- 한 프로젝트에 여러 멤버를 역할별로 배정. role 은 project_roles.key 를 참조.
-- ON UPDATE CASCADE: 설정 화면에서 role key 변경 시 자동 전파.
-- ON DELETE 없음: role 삭제는 is_active=FALSE 로만 수행 (soft delete).
CREATE TABLE project_members (
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  role        TEXT NOT NULL REFERENCES project_roles(key) ON UPDATE CASCADE,
  PRIMARY KEY (project_id, member_id, role)
);

-- schedule — 일정 데이터
-- 프로젝트별 날짜 단위 일정. content는 클라이언트 공유용, content_internal은 내부용.
CREATE TABLE schedule (
  id               SERIAL PRIMARY KEY,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  time             TEXT,                -- HH:MM 형식 (예: '09:30', '14:00'). 시각이 있는 스케줄은 셀 상단에 고정 표시
  content          TEXT,
  content_internal TEXT,
  note             TEXT,
  date_uncertain   BOOLEAN NOT NULL DEFAULT FALSE,  -- 날짜 미확정 표시 (회색 점선 테두리)
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- schedule_assignees — 일정 ↔ 담당자
-- 하나의 일정에 여러 담당자 배정 가능.
CREATE TABLE schedule_assignees (
  schedule_id INTEGER NOT NULL REFERENCES schedule(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  PRIMARY KEY (schedule_id, member_id)
);

-- attendance — 출근 기록
-- 날짜+장소 조합이 유니크. 같은 날 여러 장소 가능.
CREATE TABLE attendance (
  id          SERIAL PRIMARY KEY,
  date        DATE NOT NULL,
  location    TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (date, location)
);

-- attendance_members — 출근 ↔ 멤버
-- 해당 출근 기록에 참여한 멤버. note에 '외근', '반차' 등 개인 메모.
CREATE TABLE attendance_members (
  attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  member_id     INTEGER NOT NULL REFERENCES members(id),
  note          TEXT,                        -- 멤버별 메모 (외근, 반차 등)
  PRIMARY KEY (attendance_id, member_id)
);

-- scenarios — 시나리오 마스터
-- 낙관/비관/대안 등 시나리오 정의. 간트 차트에서 프로젝트별 기간 비교에 사용.
CREATE TABLE scenarios (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,                 -- 시나리오 이름 (낙관, 비관, alt. A)
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 초기 시드 — 4개 기본 시나리오
INSERT INTO scenarios (name, description) VALUES
  ('낙관', NULL),
  ('비관', NULL),
  ('alt. A', NULL),
  ('alt. B', NULL);

-- scenario_schedules — 시나리오별 프로젝트 기간
-- 각 시나리오에서 프로젝트의 시작/종료 날짜를 별도로 관리.
CREATE TABLE scenario_schedules (
  id          SERIAL PRIMARY KEY,
  scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date_start  DATE NOT NULL,
  date_end    DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 인덱스 — 자주 조회하는 컬럼에 인덱스 추가
-- ============================================
CREATE INDEX idx_projects_brand    ON projects(brand_id);
CREATE INDEX idx_projects_parent   ON projects(parent_id);
CREATE INDEX idx_projects_status   ON projects(status);
CREATE INDEX idx_schedule_project  ON schedule(project_id);
CREATE INDEX idx_schedule_date     ON schedule(date);
CREATE INDEX idx_attendance_date   ON attendance(date);
CREATE INDEX idx_scenario_schedules_scenario ON scenario_schedules(scenario_id);
CREATE INDEX idx_scenario_schedules_project  ON scenario_schedules(project_id);

-- ============================================
-- updated_at 자동 갱신 트리거
-- 행이 UPDATE될 때 updated_at을 현재 시간으로 자동 변경
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_brands_updated     BEFORE UPDATE ON brands     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_members_updated    BEFORE UPDATE ON members    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_projects_updated   BEFORE UPDATE ON projects   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_schedule_updated   BEFORE UPDATE ON schedule   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- batch_move_items — 다중 항목 일괄 이동 RPC
-- 캘린더뷰 cut-paste, 간트 차트 일괄 드래그에서 사용.
-- 3개 테이블을 단일 트랜잭션으로 업데이트.
-- ============================================
CREATE OR REPLACE FUNCTION batch_move_items(
  p_projects jsonb DEFAULT '[]'::jsonb,
  p_schedules jsonb DEFAULT '[]'::jsonb,
  p_scenario_schedules jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- projects: [{id, date_start?, date_end?, sort_order?, parent_id?}]
  -- 모든 필드 optional: COALESCE로 누락 시 기존값 유지
  -- parent_id는 null이 유효값(최상위)이므로 키 존재 여부(m ? 'parent_id')로 체크
  IF p_projects IS NOT NULL AND p_projects != '[]'::jsonb THEN
    UPDATE projects p
    SET date_start = COALESCE((m->>'date_start')::date, p.date_start),
        date_end   = COALESCE((m->>'date_end')::date, p.date_end),
        sort_order = COALESCE((m->>'sort_order')::int, p.sort_order),
        parent_id  = CASE WHEN m ? 'parent_id'
                          THEN (m->>'parent_id')::int
                          ELSE p.parent_id END
    FROM jsonb_array_elements(p_projects) AS m
    WHERE p.id = (m->>'id')::int;
  END IF;

  -- schedule: [{id, date, project_id?}]
  -- project_id가 null이면 기존 값 유지 (COALESCE)
  IF p_schedules IS NOT NULL AND p_schedules != '[]'::jsonb THEN
    UPDATE schedule s
    SET date       = (m->>'date')::date,
        project_id = COALESCE((m->>'project_id')::int, s.project_id)
    FROM jsonb_array_elements(p_schedules) AS m
    WHERE s.id = (m->>'id')::int;
  END IF;

  -- scenario_schedules: [{id, date_start, date_end}]
  IF p_scenario_schedules IS NOT NULL AND p_scenario_schedules != '[]'::jsonb THEN
    UPDATE scenario_schedules ss
    SET date_start = (m->>'date_start')::date,
        date_end   = (m->>'date_end')::date
    FROM jsonb_array_elements(p_scenario_schedules) AS m
    WHERE ss.id = (m->>'id')::int;
  END IF;
END;
$$;

-- keyword_highlights — 키워드 하이라이트 설정
-- 캘린더/간트에서 특정 키워드를 색상 도트로 표시.
CREATE TABLE keyword_highlights (
  id              SERIAL PRIMARY KEY,
  keyword         TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT '#6b7280',
  is_regex        BOOLEAN NOT NULL DEFAULT FALSE,
  show_header_dot BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_keyword_highlights_updated BEFORE UPDATE ON keyword_highlights FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 슬랙 링크 (프로젝트 1:N)
CREATE TABLE IF NOT EXISTS project_links (
  id            serial PRIMARY KEY,
  project_id    integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url           text NOT NULL,
  title         text NOT NULL,
  link_type     text NOT NULL DEFAULT 'message',
  channel_id    text,
  channel_name  text,
  thread_date   date,
  is_open       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_links_project_id ON project_links(project_id);
