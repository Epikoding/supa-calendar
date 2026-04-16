import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { resolve } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const DATA_DIR = resolve(__dirname, "data");

function parseMembers(value: string | undefined): string[] {
  if (!value || value.trim() === "" || value.trim() === "-") return [];
  const sep = value.includes(",") ? "," : /\s+/;
  return value
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAttendanceNote(
  note: string | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!note || note.trim() === "") return result;
  const pattern = /([가-힣]{1,5}):([^,]+)/g;
  let match;
  while ((match = pattern.exec(note)) !== null) {
    result[match[1].trim()] = match[2].trim();
  }
  return result;
}

async function main() {
  // members name_short → id 매핑
  const { data: members } = await sb.from("members").select("id, name_short");
  const memberNameMap = new Map<string, number>();
  for (const m of members || []) memberNameMap.set(m.name_short, m.id);
  console.log("멤버 매핑:", memberNameMap.size, "건");

  // CSV 읽기
  const content = readFileSync(resolve(DATA_DIR, "attendance.csv"), "utf-8");
  const rows: Record<string, string>[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  let attCount = 0;
  let memCount = 0;
  let skipCount = 0;

  for (const row of rows) {
    if (!row.date || row.date.trim() === "") {
      skipCount++;
      continue;
    }

    const { data, error } = await sb
      .from("attendance")
      .insert({
        date: row.date,
        location: row.location?.trim() || null,
        note: row.note?.trim() || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("attendance 실패:", row.date, error.message);
      continue;
    }
    attCount++;

    const memberNames = parseMembers(row.members);
    const memberNotes = parseAttendanceNote(row.note);

    for (const nameShort of memberNames) {
      const memberId = memberNameMap.get(nameShort);
      if (!memberId) continue;

      const memberNote = memberNotes[nameShort] ?? null;
      const { error: mErr } = await sb.from("attendance_members").insert({
        attendance_id: data.id,
        member_id: memberId,
        note: memberNote,
      });
      if (!mErr) memCount++;
    }
  }

  console.log(
    `완료: attendance ${attCount}건, attendance_members ${memCount}건, 스킵 ${skipCount}건`
  );
}

main().catch(console.error);
