/**
 * BX Calendar v3 — Google Sheets → Supabase 마이그레이션 스크립트
 *
 * Google Sheets에서 각 시트를 CSV로 다운로드한 뒤 Supabase에 삽입합니다.
 *
 * === 사전 준비 ===
 * 1. 프로젝트 루트에서 의존성 설치:
 *    npm install @supabase/supabase-js csv-parse
 *
 * 2. 각 시트를 CSV로 다운로드하여 scripts/data/ 폴더에 저장:
 *    - scripts/data/brands.csv
 *    - scripts/data/members.csv
 *    - scripts/data/projects.csv
 *    - scripts/data/schedule.csv
 *    - scripts/data/attendance.csv
 *
 * 3. 환경변수 설정:
 *    export SUPABASE_URL="https://your-project.supabase.co"
 *    export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
 *    (RLS를 우회하기 위해 service_role key 사용)
 *
 * === 실행 ===
 *    npx tsx scripts/migrate-from-sheets.ts
 *
 * === CSV 컬럼 규칙 ===
 * - brands.csv:    brand_id, code, name, drive_root, color, sort_order, calendar_id
 * - members.csv:   member_id, name, name_short, role, slack_id, email, active
 * - projects.csv:  project_id, brand_id, parent_id, name, drive_path, date_start, date_end, status, settled, designer, pm
 * - schedule.csv:  schedule_id, project_id, date, content, content_internal, note, assignee
 * - attendance.csv: attendance_id, date, location, note, members
 *
 * - designer, pm, assignee, members 컬럼은 쉼표 구분 단축이름 (예: "수진, 인애")
 * - attendance.note에서 "이름:메모" 패턴을 파싱하여 attendance_members.note에 분리
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ============================================
// 설정
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 설정하세요."
  );
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_DIR = resolve(__dirname, "data");

// ============================================
// 유틸리티
// ============================================

/** CSV 파일을 읽어 객체 배열로 반환 */
function readCsv(filename: string): Record<string, string>[] {
  const filepath = resolve(DATA_DIR, filename);
  if (!existsSync(filepath)) {
    console.error(`CSV 파일이 없습니다: ${filepath}`);
    process.exit(1);
  }
  const content = readFileSync(filepath, "utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

/** 쉼표 구분 문자열을 배열로 파싱. 빈 문자열이면 빈 배열 반환 */
function parseCommaSeparated(value: string | undefined): string[] {
  if (!value || value.trim() === "" || value.trim() === "-") return [];
  // 쉼표가 있으면 쉼표로 분리, 없으면 공백으로 분리 (attendance 호환)
  const separator = value.includes(",") ? "," : /\s+/;
  return value.split(separator).map((s) => s.trim()).filter(Boolean);
}

/** 빈 문자열을 null로 변환 */
function emptyToNull(value: string | undefined): string | null {
  if (!value || value.trim() === "") return null;
  return value.trim();
}

/** 빈 문자열을 null로, 숫자 문자열을 number로 변환 */
function toIntOrNull(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const num = parseInt(value.trim(), 10);
  return isNaN(num) ? null : num;
}

/** "Y"/"TRUE"/"1" → true, 나머지 → false */
function toBool(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toUpperCase();
  return v === "Y" || v === "TRUE" || v === "1" || v === "YES";
}

/**
 * attendance.note에서 "이름:메모" 패턴을 파싱
 * 예: "수진:외근" → { "수진": "외근" }
 * 예: "전체 재택" → {} (패턴 없음)
 */
function parseAttendanceNote(
  note: string | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!note || note.trim() === "") return result;

  // "이름:메모" 패턴 찾기 (한글이름 1~5자 + 콜론 + 메모)
  const pattern = /([가-힣]{1,5}):([^,]+)/g;
  let match;
  while ((match = pattern.exec(note)) !== null) {
    result[match[1].trim()] = match[2].trim();
  }
  return result;
}

// ============================================
// ID 매핑 테이블
// ============================================

/** 기존 시트 ID → Supabase auto-increment ID */
const brandIdMap = new Map<string, number>();
const memberIdMap = new Map<string, number>();
const memberNameMap = new Map<string, number>(); // name_short → member.id
const projectIdMap = new Map<string, number>();
const scheduleIdMap = new Map<string, number>();
const attendanceIdMap = new Map<string, number>();

// ============================================
// 마이그레이션 카운터
// ============================================

const counts = {
  brands: 0,
  members: 0,
  projects: 0,
  project_members: 0,
  project_members_designers: 0,
  project_members_pms: 0,
  schedule: 0,
  schedule_assignees: 0,
  attendance: 0,
  attendance_members: 0,
};

// ============================================
// 1. brands 마이그레이션
// ============================================

async function migrateBrands(): Promise<void> {
  console.log("\n[1/5] brands 마이그레이션...");
  const rows = readCsv("brands.csv");

  for (const row of rows) {
    const { data, error } = await supabase
      .from("brands")
      .insert({
        code: row.brand_id,
        name: row.name,
        drive_root: emptyToNull(row.drive_root),
        color: emptyToNull(row.color),
        sort_order: toIntOrNull(row.sort_order) ?? 0,
        calendar_id: emptyToNull(row.calendar_id),
      })
      .select("id")
      .single();

    if (error) {
      console.error(`  brands 삽입 실패 (${row.code}):`, error.message);
      continue;
    }

    brandIdMap.set(row.brand_id, data.id);
    counts.brands++;
  }
  console.log(`  brands: ${counts.brands}건 삽입 완료`);
}

// ============================================
// 2. members 마이그레이션
// ============================================

async function migrateMembers(): Promise<void> {
  console.log("\n[2/5] members 마이그레이션...");
  const rows = readCsv("members.csv");

  for (const row of rows) {
    const { data, error } = await supabase
      .from("members")
      .insert({
        name: row.name,
        name_short: row.name_short,
        role: emptyToNull(row.role),
        slack_id: emptyToNull(row.slack_id),
        email: emptyToNull(row.email),
        active: row.active !== undefined ? toBool(row.active) : true,
      })
      .select("id")
      .single();

    if (error) {
      console.error(
        `  members 삽입 실패 (${row.name_short}):`,
        error.message
      );
      continue;
    }

    memberIdMap.set(row.member_id, data.id);
    memberNameMap.set(row.name_short, data.id);
    counts.members++;
  }
  console.log(`  members: ${counts.members}건 삽입 완료`);
}

// ============================================
// 3. projects 마이그레이션 (2패스)
// ============================================

async function migrateProjects(): Promise<void> {
  console.log("\n[3/5] projects 마이그레이션...");
  const rows = readCsv("projects.csv");

  // --- 패스 1: parent_id 없이 전체 삽입 ---
  console.log("  패스 1: 프로젝트 삽입 (parent_id 제외)...");
  for (const row of rows) {
    // brand_id 매핑: 시트의 brand_id 값으로 brands.id 조회
    const brandId = brandIdMap.get(row.brand_id);
    if (brandId === undefined) {
      console.error(
        `  projects 삽입 실패: brand_id "${row.brand_id}" 매핑 없음 (프로젝트: ${row.name})`
      );
      continue;
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        brand_id: brandId,
        parent_id: null, // 패스 2에서 설정
        name: row.name,
        drive_path: emptyToNull(row.drive_path),
        date_start: emptyToNull(row.date_start),
        date_end: emptyToNull(row.date_end),
        status: emptyToNull(row.status) ?? "진행중",
        settled: row.settled !== undefined ? toBool(row.settled) : false,
      })
      .select("id")
      .single();

    if (error) {
      console.error(
        `  projects 삽입 실패 (${row.project_id}):`,
        error.message
      );
      continue;
    }

    projectIdMap.set(row.project_id, data.id);
    counts.projects++;
  }
  console.log(`  프로젝트 ${counts.projects}건 삽입 완료`);

  // --- 패스 2: parent_id가 있는 행을 UPDATE ---
  console.log("  패스 2: parent_id 설정...");
  let parentUpdated = 0;
  for (const row of rows) {
    if (!row.parent_id || row.parent_id.trim() === "") continue;

    const projectId = projectIdMap.get(row.project_id);
    const parentId = projectIdMap.get(row.parent_id);

    if (projectId === undefined || parentId === undefined) {
      console.error(
        `  parent_id 설정 실패: project="${row.project_id}" → parent="${row.parent_id}" 매핑 없음`
      );
      continue;
    }

    const { error } = await supabase
      .from("projects")
      .update({ parent_id: parentId })
      .eq("id", projectId);

    if (error) {
      console.error(
        `  parent_id UPDATE 실패 (${row.project_id}):`,
        error.message
      );
      continue;
    }
    parentUpdated++;
  }
  console.log(`  parent_id ${parentUpdated}건 설정 완료`);

  // --- project_members 삽입 (designer, pm) ---
  console.log("  project_members 삽입...");
  for (const row of rows) {
    const projectId = projectIdMap.get(row.project_id);
    if (projectId === undefined) continue;

    // designer 필드
    const designers = parseCommaSeparated(row.designer);
    for (const nameShort of designers) {
      const memberId = memberNameMap.get(nameShort);
      if (memberId === undefined) {
        console.error(
          `  project_members: 멤버 "${nameShort}" 매핑 없음 (프로젝트: ${row.project_id})`
        );
        continue;
      }
      const { error } = await supabase.from("project_members").insert({
        project_id: projectId,
        member_id: memberId,
        role: "designer",
      });
      if (error) {
        console.error(
          `  project_members 삽입 실패 (designer):`,
          error.message
        );
        continue;
      }
      counts.project_members++;
      counts.project_members_designers++;
    }

    // pm 필드
    const pms = parseCommaSeparated(row.pm);
    for (const nameShort of pms) {
      const memberId = memberNameMap.get(nameShort);
      if (memberId === undefined) {
        console.error(
          `  project_members: 멤버 "${nameShort}" 매핑 없음 (프로젝트: ${row.project_id})`
        );
        continue;
      }
      const { error } = await supabase.from("project_members").insert({
        project_id: projectId,
        member_id: memberId,
        role: "pm",
      });
      if (error) {
        console.error(`  project_members 삽입 실패 (pm):`, error.message);
        continue;
      }
      counts.project_members++;
      counts.project_members_pms++;
    }
  }
  console.log(
    `  project_members: ${counts.project_members}건 삽입 완료 (designers: ${counts.project_members_designers}, pms: ${counts.project_members_pms})`
  );
}

// ============================================
// 4. schedule 마이그레이션
// ============================================

async function migrateSchedule(): Promise<void> {
  console.log("\n[4/5] schedule 마이그레이션...");
  const rows = readCsv("schedule.csv");

  for (const row of rows) {
    // project_id 매핑
    const projectId = projectIdMap.get(row.project_id);
    if (projectId === undefined) {
      console.error(
        `  schedule 삽입 실패: project_id "${row.project_id}" 매핑 없음 (일정: ${row.schedule_id})`
      );
      continue;
    }

    const { data, error } = await supabase
      .from("schedule")
      .insert({
        project_id: projectId,
        date: row.date,
        content: emptyToNull(row.content),
        content_internal: emptyToNull(row.content_internal),
        note: emptyToNull(row.note),
      })
      .select("id")
      .single();

    if (error) {
      console.error(
        `  schedule 삽입 실패 (${row.schedule_id}):`,
        error.message
      );
      continue;
    }

    scheduleIdMap.set(row.schedule_id, data.id);
    counts.schedule++;

    // schedule_assignees 삽입
    const assignees = parseCommaSeparated(row.assignee);
    for (const nameShort of assignees) {
      const memberId = memberNameMap.get(nameShort);
      if (memberId === undefined) {
        console.error(
          `  schedule_assignees: 멤버 "${nameShort}" 매핑 없음 (일정: ${row.schedule_id})`
        );
        continue;
      }
      const { error: assignError } = await supabase
        .from("schedule_assignees")
        .insert({
          schedule_id: data.id,
          member_id: memberId,
        });
      if (assignError) {
        console.error(
          `  schedule_assignees 삽입 실패:`,
          assignError.message
        );
        continue;
      }
      counts.schedule_assignees++;
    }
  }
  console.log(`  schedule: ${counts.schedule}건 삽입 완료`);
  console.log(
    `  schedule_assignees: ${counts.schedule_assignees}건 삽입 완료`
  );
}

// ============================================
// 5. attendance 마이그레이션
// ============================================

async function migrateAttendance(): Promise<void> {
  console.log("\n[5/5] attendance 마이그레이션...");
  const rows = readCsv("attendance.csv");

  for (const row of rows) {
    const noteText = emptyToNull(row.note);

    const { data, error } = await supabase
      .from("attendance")
      .insert({
        date: row.date,
        location: emptyToNull(row.location),
        note: noteText,
      })
      .select("id")
      .single();

    if (error) {
      console.error(
        `  attendance 삽입 실패 (${row.date}/${row.location}):`,
        error.message
      );
      continue;
    }

    attendanceIdMap.set(`${row.date}/${row.location}`, data.id);
    counts.attendance++;

    // attendance_members 삽입
    const memberNames = parseCommaSeparated(row.members);

    // note에서 "이름:메모" 패턴 파싱
    const memberNotes = parseAttendanceNote(row.note);

    for (const nameShort of memberNames) {
      const memberId = memberNameMap.get(nameShort);
      if (memberId === undefined) {
        console.error(
          `  attendance_members: 멤버 "${nameShort}" 매핑 없음 (출근: ${row.attendance_id})`
        );
        continue;
      }

      // 해당 멤버에 대한 개인 메모가 있으면 설정
      const memberNote = memberNotes[nameShort] ?? null;

      const { error: memberError } = await supabase
        .from("attendance_members")
        .insert({
          attendance_id: data.id,
          member_id: memberId,
          note: memberNote,
        });
      if (memberError) {
        console.error(
          `  attendance_members 삽입 실패:`,
          memberError.message
        );
        continue;
      }
      counts.attendance_members++;
    }
  }
  console.log(`  attendance: ${counts.attendance}건 삽입 완료`);
  console.log(
    `  attendance_members: ${counts.attendance_members}건 삽입 완료`
  );
}

// ============================================
// 메인 실행
// ============================================

async function main(): Promise<void> {
  console.log("============================================");
  console.log("BX Calendar v3 — 마이그레이션 시작");
  console.log("============================================");
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`CSV 데이터 경로: ${DATA_DIR}`);

  // CSV 파일 존재 확인
  const requiredFiles = [
    "brands.csv",
    "members.csv",
    "projects.csv",
    "schedule.csv",
    "attendance.csv",
  ];
  const missingFiles = requiredFiles.filter(
    (f) => !existsSync(resolve(DATA_DIR, f))
  );
  if (missingFiles.length > 0) {
    console.error(`\n필수 CSV 파일이 없습니다: ${missingFiles.join(", ")}`);
    console.error(`${DATA_DIR}/ 폴더에 CSV 파일을 넣어주세요.`);
    process.exit(1);
  }

  // 순서대로 마이그레이션 (brands → members → projects → schedule → attendance)
  await migrateBrands();
  await migrateMembers();
  await migrateProjects();
  await migrateSchedule();
  await migrateAttendance();

  // 결과 요약
  console.log("\n============================================");
  console.log("Migration complete:");
  console.log(`  brands: ${counts.brands} rows`);
  console.log(`  members: ${counts.members} rows`);
  console.log(`  projects: ${counts.projects} rows`);
  console.log(
    `  project_members: ${counts.project_members} rows (designers: ${counts.project_members_designers}, pms: ${counts.project_members_pms})`
  );
  console.log(`  schedule: ${counts.schedule} rows`);
  console.log(`  schedule_assignees: ${counts.schedule_assignees} rows`);
  console.log(`  attendance: ${counts.attendance} rows`);
  console.log(`  attendance_members: ${counts.attendance_members} rows`);
  console.log("============================================");
}

main().catch((err) => {
  console.error("마이그레이션 실패:", err);
  process.exit(1);
});
