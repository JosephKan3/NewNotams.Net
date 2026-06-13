import { NextRequest, NextResponse } from "next/server"
import { getSchedulesDueAt } from "@/app/api/schedule/route"
import type { ScheduleConfig } from "@/app/api/schedule/route"
import { auth } from "@/auth"
import { sendPushToUser } from "@/lib/push"
import type { PushPayload } from "@/lib/push"

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

function extractNotamSummary(text: string): { id: string; summary: string } | null {
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

interface SendConfig {
  savedQuery: string
  dismissedIds?: string[]
}

interface BuiltNotification {
  title: string
  payloads: PushPayload[]
}

async function buildNotification(config: SendConfig): Promise<{ ok: true; result: BuiltNotification } | { ok: false; error: string }> {
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

export async function GET(request: NextRequest) {
  // ── Cron path ────────────────────────────────────────────────────────────────
  // Called every hour by an external cron (e.g. cron-job.org). Iterates all
  // stored user schedules. Requires Authorization: Bearer <CRON_SECRET> header.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const currentHour = new Date().getUTCHours()

  let schedules: ScheduleConfig[]
  try {
    schedules = await getSchedulesDueAt(currentHour)
  } catch {
    schedules = []
  }

  if (schedules.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "No schedules due at this hour" })
  }

  const results = await Promise.all(
    schedules.map(async (s) => {
      const built = await buildNotification({ savedQuery: s.savedQuery, dismissedIds: s.dismissedIds })
      if (!built.ok) return { ok: false, error: built.error }

      let sent = 0
      for (const payload of built.result.payloads) {
        sent += await sendPushToUser(s.userId, payload)
      }
      return { ok: true, title: built.result.title, devicesSent: sent }
    })
  )

  const sent = results.filter(r => r.ok).length
  return NextResponse.json({ ok: true, sent, total: schedules.length, results })
}

// ── User-triggered path ───────────────────────────────────────────────────────
// Sends a one-off notification to the signed-in user's subscribed devices using
// the saved search query from the request body.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { savedQuery?: string; dismissedIds?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.savedQuery) {
    return NextResponse.json({ error: "Missing savedQuery" }, { status: 400 })
  }

  const built = await buildNotification({ savedQuery: body.savedQuery, dismissedIds: body.dismissedIds })
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 502 })
  }

  let sent = 0
  for (const payload of built.result.payloads) {
    sent += await sendPushToUser(session.user.id, payload)
  }

  if (sent === 0) {
    return NextResponse.json({ error: "No active push subscriptions. Enable notifications first." }, { status: 400 })
  }

  return NextResponse.json({ ok: true, title: built.result.title, sent })
}
