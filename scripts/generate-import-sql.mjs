import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = parseLine(lines[0])
  return lines.slice(1).map(line => {
    const values = parseLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h.trim()] = (values[i] ?? '').trim() })
    return obj
  })
}

function parseLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else { current += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { fields.push(current); current = '' }
      else { current += ch }
    }
  }
  fields.push(current)
  return fields
}

function readCSV(filename) {
  return parseCSV(readFileSync(join(DATA_DIR, filename), 'utf-8'))
}

function pcode(code) {
  if (!code || !code.trim()) return null
  return parseInt(code.replace(/^P/, ''), 10)
}

function esc(s) {
  if (!s || !s.trim()) return 'NULL'
  return `'${s.replace(/'/g, "''")}'`
}

function dateOrNull(s) {
  if (!s || !s.trim()) return 'NULL'
  return `'${s}'`
}

const BRAND_MAP = {
  ACME: 1, BLUE: 2, GREEN: 3, SUNSET: 4, NOVA: 5,
}
const MEMBER_MAP = {
  'Alice': 1, 'Bob': 2, 'Carol': 3, 'David': 4, 'Eve': 5,
  'Frank': 6,
}
const SCENARIO_MAP = { S01: 1, S02: 2, S03: 3, S04: 4 }

const sqls = []

// 1. Projects (without parent_id)
const projects = readCSV('projects.csv')
const projValues = projects.map(p =>
  `(${pcode(p.project_id)}, ${BRAND_MAP[p.brand_id]}, NULL, ${esc(p.name)}, ${esc(p.drive_path)}, ${dateOrNull(p.date_start)}, ${dateOrNull(p.date_end)}, ${esc(p.status || '진행중')}, ${p.settled === 'TRUE'})`
).join(',\n')
sqls.push(`INSERT INTO projects (id, brand_id, parent_id, name, drive_path, date_start, date_end, status, settled) VALUES\n${projValues};`)

// Parent_id updates
const parentUpdates = projects
  .filter(p => p.parent_id && p.parent_id.trim())
  .map(p => `WHEN ${pcode(p.project_id)} THEN ${pcode(p.parent_id)}`)
const parentIds = projects
  .filter(p => p.parent_id && p.parent_id.trim())
  .map(p => pcode(p.project_id))
if (parentUpdates.length > 0) {
  sqls.push(`UPDATE projects SET parent_id = CASE id\n${parentUpdates.join('\n')}\nEND\nWHERE id IN (${parentIds.join(',')});`)
}

// 2. Project members
const pmRows = []
for (const p of projects) {
  const pid = pcode(p.project_id)
  if (p.pm && p.pm.trim() && p.pm.trim() !== 'TBD') {
    for (const name of p.pm.split(',').map(n => n.trim()).filter(Boolean)) {
      const mid = MEMBER_MAP[name]
      if (mid) pmRows.push(`(${pid}, ${mid}, 'pm')`)
    }
  }
  if (p.designer && p.designer.trim() && p.designer.trim() !== 'TBD') {
    for (const name of p.designer.split(',').map(n => n.trim()).filter(Boolean)) {
      const mid = MEMBER_MAP[name]
      if (mid) pmRows.push(`(${pid}, ${mid}, 'designer')`)
    }
  }
}
if (pmRows.length > 0) {
  sqls.push(`INSERT INTO project_members (project_id, member_id, role) VALUES\n${pmRows.join(',\n')};`)
}

// 3. Scenarios
const scenarios = readCSV('scenarios.csv')
const scValues = scenarios.map(s =>
  `(${SCENARIO_MAP[s.scenario_id]}, ${esc(s.name)}, ${esc(s.description)})`
).join(',\n')
sqls.push(`INSERT INTO scenarios (id, name, description) VALUES\n${scValues};`)

// 4. Schedule
const schedule = readCSV('schedule.csv')
const schedValues = schedule.map(s => {
  const sid = parseInt(s.schedule_id.replace(/^S/, ''), 10)
  return `(${sid}, ${pcode(s.project_id)}, '${s.date}', ${esc(s.content)}, ${esc(s.content_internal)}, ${esc(s.note)})`
}).join(',\n')
sqls.push(`INSERT INTO schedule (id, project_id, date, content, content_internal, note) VALUES\n${schedValues};`)

// 5. Schedule assignees
const assigneeRows = []
for (const s of schedule) {
  const sid = parseInt(s.schedule_id.replace(/^S/, ''), 10)
  if (s.assignee && s.assignee.trim()) {
    for (const name of s.assignee.split(',').map(n => n.trim()).filter(Boolean)) {
      const mid = MEMBER_MAP[name]
      if (mid) assigneeRows.push(`(${sid}, ${mid})`)
    }
  }
}
if (assigneeRows.length > 0) {
  sqls.push(`INSERT INTO schedule_assignees (schedule_id, member_id) VALUES\n${assigneeRows.join(',\n')};`)
}

// 6. Scenario schedules
const scenarioSchedules = readCSV('scenario_schedules.csv')
const ssValues = scenarioSchedules.map(s => {
  const sid = parseInt(s.schedule_id.replace(/^SS/, ''), 10)
  return `(${sid}, ${SCENARIO_MAP[s.scenario_id]}, ${pcode(s.project_id)}, '${s.date_start}', '${s.date_end}')`
}).join(',\n')
sqls.push(`INSERT INTO scenario_schedules (id, scenario_id, project_id, date_start, date_end) VALUES\n${ssValues};`)

// 7. Reset sequences
const maxProjectId = Math.max(...projects.map(p => pcode(p.project_id)))
const maxScheduleId = Math.max(...schedule.map(s => parseInt(s.schedule_id.replace(/^S/, ''), 10)))
const maxScenarioId = Math.max(...scenarios.map(s => SCENARIO_MAP[s.scenario_id]))
const maxSSId = Math.max(...scenarioSchedules.map(s => parseInt(s.schedule_id.replace(/^SS/, ''), 10)))
sqls.push(`SELECT setval('projects_id_seq', ${maxProjectId});`)
sqls.push(`SELECT setval('schedule_id_seq', ${maxScheduleId});`)
sqls.push(`SELECT setval('scenarios_id_seq', ${maxScenarioId});`)
sqls.push(`SELECT setval('scenario_schedules_id_seq', ${maxSSId});`)

// Output each SQL statement separated by markers
sqls.forEach((sql, i) => {
  console.log(`--- STEP ${i + 1} ---`)
  console.log(sql)
})

// Also write to file for reference
writeFileSync(join(__dirname, 'import.sql'), sqls.join('\n\n'), 'utf-8')
console.log(`\nSQL written to scripts/import.sql`)
console.log(`Stats: ${projects.length} projects, ${pmRows.length} project_members, ${scenarios.length} scenarios, ${schedule.length} schedule, ${assigneeRows.length} assignees, ${scenarioSchedules.length} scenario_schedules`)
