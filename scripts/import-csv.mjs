import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// --- CSV parser (handles quoted fields with commas) ---
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

// --- Mappings ---
const BRAND_MAP = {
  ACME: 1, BLUE: 2, GREEN: 3, SUNSET: 4, NOVA: 5,
}
const MEMBER_MAP = {
  'Alice': 1, 'Bob': 2, 'Carol': 3, 'David': 4, 'Eve': 5,
  'Frank': 6,
}
const SCENARIO_MAP = { S01: 1, S02: 2, S03: 3, S04: 4 }

async function main() {
  console.log('=== Starting import ===')

  // 1. Projects (insert without parent_id first)
  const projects = readCSV('projects.csv')
  console.log(`Projects: ${projects.length} rows`)

  const projectRows = projects.map(p => ({
    id: pcode(p.project_id),
    brand_id: BRAND_MAP[p.brand_id],
    name: p.name,
    drive_path: p.drive_path || null,
    date_start: p.date_start || null,
    date_end: p.date_end || null,
    status: p.status || '진행중',
    settled: p.settled === 'TRUE',
  }))

  // Insert in batches of 50
  for (let i = 0; i < projectRows.length; i += 50) {
    const batch = projectRows.slice(i, i + 50)
    const { error } = await supabase.from('projects').insert(batch)
    if (error) { console.error(`Projects batch ${i}: ${error.message}`); return }
    console.log(`  Projects ${i + 1}-${i + batch.length} inserted`)
  }

  // Update parent_ids
  const parentUpdates = projects
    .filter(p => p.parent_id && p.parent_id.trim())
    .map(p => ({ id: pcode(p.project_id), parent_id: pcode(p.parent_id) }))

  for (const u of parentUpdates) {
    const { error } = await supabase.from('projects').update({ parent_id: u.parent_id }).eq('id', u.id)
    if (error) { console.error(`Parent update ${u.id}: ${error.message}`); return }
  }
  console.log(`  ${parentUpdates.length} parent_ids updated`)

  // 2. Project members (from pm/designer columns)
  const pmRows = []
  for (const p of projects) {
    const pid = pcode(p.project_id)
    if (p.pm && p.pm.trim() && p.pm.trim() !== 'TBD') {
      for (const name of p.pm.split(',').map(n => n.trim()).filter(Boolean)) {
        const mid = MEMBER_MAP[name]
        if (mid) pmRows.push({ project_id: pid, member_id: mid, role: 'pm' })
        else console.warn(`  Unknown PM: "${name}" in ${p.project_id}`)
      }
    }
    if (p.designer && p.designer.trim() && p.designer.trim() !== 'TBD') {
      for (const name of p.designer.split(',').map(n => n.trim()).filter(Boolean)) {
        const mid = MEMBER_MAP[name]
        if (mid) pmRows.push({ project_id: pid, member_id: mid, role: 'designer' })
        else console.warn(`  Unknown designer: "${name}" in ${p.project_id}`)
      }
    }
  }
  console.log(`Project members: ${pmRows.length} rows`)
  for (let i = 0; i < pmRows.length; i += 50) {
    const batch = pmRows.slice(i, i + 50)
    const { error } = await supabase.from('project_members').insert(batch)
    if (error) { console.error(`Project members batch ${i}: ${error.message}`); return }
  }
  console.log('  Project members inserted')

  // 3. Scenarios
  const scenarios = readCSV('scenarios.csv')
  console.log(`Scenarios: ${scenarios.length} rows`)
  const scenarioRows = scenarios.map(s => ({
    id: SCENARIO_MAP[s.scenario_id],
    name: s.name,
    description: s.description || null,
  }))
  const { error: scErr } = await supabase.from('scenarios').insert(scenarioRows)
  if (scErr) { console.error(`Scenarios: ${scErr.message}`); return }
  console.log('  Scenarios inserted')

  // 4. Schedule
  const schedule = readCSV('schedule.csv')
  console.log(`Schedule: ${schedule.length} rows`)
  const scheduleRows = schedule.map(s => ({
    id: parseInt(s.schedule_id.replace(/^S/, ''), 10),
    project_id: pcode(s.project_id),
    date: s.date,
    content: s.content || null,
    content_internal: s.content_internal || null,
    note: s.note || null,
  }))
  for (let i = 0; i < scheduleRows.length; i += 50) {
    const batch = scheduleRows.slice(i, i + 50)
    const { error } = await supabase.from('schedule').insert(batch)
    if (error) { console.error(`Schedule batch ${i}: ${error.message}`); return }
    console.log(`  Schedule ${i + 1}-${i + batch.length} inserted`)
  }

  // 5. Schedule assignees (from assignee column)
  const assigneeRows = []
  for (const s of schedule) {
    const sid = parseInt(s.schedule_id.replace(/^S/, ''), 10)
    if (s.assignee && s.assignee.trim()) {
      for (const name of s.assignee.split(',').map(n => n.trim()).filter(Boolean)) {
        const mid = MEMBER_MAP[name]
        if (mid) assigneeRows.push({ schedule_id: sid, member_id: mid })
        else console.warn(`  Unknown assignee: "${name}" in ${s.schedule_id}`)
      }
    }
  }
  console.log(`Schedule assignees: ${assigneeRows.length} rows`)
  for (let i = 0; i < assigneeRows.length; i += 50) {
    const batch = assigneeRows.slice(i, i + 50)
    const { error } = await supabase.from('schedule_assignees').insert(batch)
    if (error) { console.error(`Assignees batch ${i}: ${error.message}`); return }
  }
  console.log('  Schedule assignees inserted')

  // 6. Scenario schedules
  const scenarioSchedules = readCSV('scenario_schedules.csv')
  console.log(`Scenario schedules: ${scenarioSchedules.length} rows`)
  const ssRows = scenarioSchedules.map(s => ({
    id: parseInt(s.schedule_id.replace(/^SS/, ''), 10),
    scenario_id: SCENARIO_MAP[s.scenario_id],
    project_id: pcode(s.project_id),
    date_start: s.date_start,
    date_end: s.date_end,
  }))
  const { error: ssErr } = await supabase.from('scenario_schedules').insert(ssRows)
  if (ssErr) { console.error(`Scenario schedules: ${ssErr.message}`); return }
  console.log('  Scenario schedules inserted')

  // 7. Reset sequences
  console.log('Resetting sequences...')
  // We can't reset sequences via supabase-js, skip for now

  console.log('=== Import complete ===')

  // Verify counts
  const counts = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('project_members').select('project_id', { count: 'exact', head: true }),
    supabase.from('scenarios').select('id', { count: 'exact', head: true }),
    supabase.from('schedule').select('id', { count: 'exact', head: true }),
    supabase.from('schedule_assignees').select('schedule_id', { count: 'exact', head: true }),
    supabase.from('scenario_schedules').select('id', { count: 'exact', head: true }),
  ])
  console.log('Verification:')
  console.log(`  projects: ${counts[0].count}`)
  console.log(`  project_members: ${counts[1].count}`)
  console.log(`  scenarios: ${counts[2].count}`)
  console.log(`  schedule: ${counts[3].count}`)
  console.log(`  schedule_assignees: ${counts[4].count}`)
  console.log(`  scenario_schedules: ${counts[5].count}`)
}

main().catch(console.error)
