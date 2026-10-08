// Shared notification-building and schedule-lookup logic.
//
// Extracted from app/api/notify/route.ts and app/api/schedule/route.ts so
// the hourly notify sweep (an EventBridge-invoked Lambda on AWS, replacing
// the old public GET cron endpoint — see the Phase 1 action plan §2's note
// on why this split exists) and the user-triggered POST route both call the
// exact same logic. Duplicating this between a route handler and a Lambda
// handler is exactly the kind of drift that makes "the weather brief
// silently stops arriving" hard to debug — so there is exactly one copy.
//
// No Next.js imports here (no NextRequest/NextResponse, no auth()) — this
// module must be importable from a plain Lambda handler with no Next.js
// runtime underneath it.

import { getKv } from "@/lib/kv"
import type { PushPayload } from "@/lib/push"

export interface ScheduleConfig {
  userId: string
  notifyHours: number[]   // UTC hours to send, e.g. [6, 12, 18]
  savedQuery: string       // raw URLSearchParams query string
  dismissedIds?: string[]  // NOTAM IDs to exclude from notifications
  filterDismissed?: boolean
  createdAt: string
}

export const SCHEDULE_USER_IDS_KEY = "schedule_user_ids"

export function scheduleKey(userId: string): string {
  return `schedule:${userId}`
}

// Used by both app/api/schedule/route.ts (to list/create/update a schedule)
// and the hourly notify sweep (to find who is due this hour).
export async function getSchedulesDueAt(utcHour: number): Promise<ScheduleConfig[]> {
  const userIds = await getKv().smembers<string[]>(SCHEDULE_USER_IDS_KEY)
  if (!userIds?.length) return []

  const configs = await Promise.all(
    userIds.map(userId => getKv().get<ScheduleConfig>(scheduleKey(userId)))
  )

  return configs.filter(
    (c): c is ScheduleConfig => c !== null && c.notifyHours.includes(utcHour)
  )
}

interface NavCanadaItem {
  type: string
  pk: string
  location: string | null
  text: string
}

function formatUtcTime(isoString: string): string {
  const d = new Date(isoString)
  const day = d.getUTCDate().toString().padStart(2, "0")
  const hh  = d.getUTCHours().toString().padStart(2, "0")
  const mm  = d.getUTCMinutes().toString().padStart(2, "0")
  return `${day}${hh}${mm}Z`
}

export function extractNotamSummary(text: string): { id: string; summary: string } | null {
  try {
    const parsed = JSON.parse(text)
    const raw = parsed.raw as string
    const idMatch = raw.match(/\(([A-Z]\d+\/\d+)\s+NOTAM/)
    const id = idMatch ? idMatch[1] : "?"
    const eMatch = raw.match(/E\)\s*(.+?)(?:\n|$)/)
    const summary = eMatch ? eMatch[1].trim().slice(0, 70) : raw.slice(0, 70)
    return { id, summary }
  } catch {
    return null
  }
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars - 1).trimEnd() + "…" : text
}

export interface SendConfig {
  savedQuery: string
  dismissedIds?: string[]
}

export interface BuiltNotification {
  title: string
  payloads: PushPayload[]
}

export async function buildNotification(
  config: SendConfig,
): Promise<{ ok: true; result: BuiltNotification } | { ok: false; error: string }> {
  const navUrl = new URL("https://plan.navcanada.ca/weather/api/alpha/")
  const saved = new URLSearchParams(config.savedQuery)

  saved.getAll("site").forEach(s => navUrl.searchParams.append("site", s))
  const alphas = saved.getAll("alpha").filter(a =>
    ["metar", "taf", "notam", "sigmet", "airmet", "pirep", "upperwind", "space_weather"].includes(a)
  )
  ;(alphas.length ? alphas : ["metar", "taf", "notam", "sigmet", "airmet", "pirep"])
    .forEach(a => navUrl.searchParams.append("alpha", a))
  saved.getAll("image").forEach(img => navUrl.searchParams.append("image", img))
  navUrl.searchParams.set("notam_choice", saved.get("notam_choice") || "default")
  navUrl.searchParams.set("_", Date.now().toString())

  const sites = navUrl.searchParams.getAll("site")

  let navData: { meta: { now: string }; data: NavCanadaItem[] }
  try {
    const res = await fetch(navUrl.toString(), {
      headers: { "User-Agent": "NewNotams.Net/1.0" },
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`Status ${res.status}`)
    navData = await res.json()
  } catch (e) {
    return { ok: false, error: `Nav Canada fetch failed: ${e}` }
  }

  const items   = navData.data || []
  const timeStr = formatUtcTime(navData.meta.now)
  const metars  = items.filter(i => i.type === "metar")
  const tafs    = items.filter(i => i.type === "taf")
  const dismissed = new Set(config.dismissedIds ?? [])
  const allNotams = items.filter(i => i.type === "notam")
  const notams  = dismissed.size > 0
    ? allNotams.filter(i => {
        const parsed = extractNotamSummary(i.text)
        return !parsed || !dismissed.has(parsed.id)
      })
    : allNotams
  const sigmets = items.filter(i => i.type === "sigmet")
  const airmets = items.filter(i => i.type === "airmet")
  const pireps  = items.filter(i => i.type === "pirep")

  const sitesLabel = sites.join("/")
  const title = `${sitesLabel} Weather Brief - ${timeStr}`
  const url = `/?${config.savedQuery}`
  const payloads: PushPayload[] = []

  // 1 — NOTAMs
  if (notams.length > 0) {
    const notamLines = notams.flatMap(n => {
      const p = extractNotamSummary(n.text)
      return p ? [`${p.id}: ${p.summary}`] : []
    })
    payloads.push({
      title: `${sitesLabel} - ${notams.length} New NOTAM${notams.length > 1 ? "s" : ""}`,
      body: truncate(notamLines.join("\n"), 200),
      url,
      tag: "notams",
    })
  }

  // 2 — Weather summary
  const summaryLines: string[] = []
  if (sigmets.length > 0) summaryLines.push(`SIGMET: ${sigmets.length} active`)
  if (airmets.length > 0) summaryLines.push(`AIRMET: ${airmets.length} active`)
  if (pireps.length > 0)  summaryLines.push(`PIREP: ${pireps.length}`)
  for (const site of sites) {
    const metar = metars.find(i => i.location === site)
    const taf   = tafs.find(i => i.location === site)
    if (metar) summaryLines.push(metar.text.trim())
    if (taf)   summaryLines.push(taf.text.trim())
  }

  if (summaryLines.length > 0) {
    payloads.push({
      title,
      body: truncate(summaryLines.join("\n"), 200),
      url,
      tag: "weather",
    })
  }

  if (payloads.length === 0) {
    payloads.push({ title, body: "No new updates.", url, tag: "weather" })
  }

  return { ok: true, result: { title, payloads } }
}
