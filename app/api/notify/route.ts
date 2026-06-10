import { NextRequest, NextResponse } from "next/server"
import { getSchedulesDueAt } from "@/app/api/schedule/route"
import type { ScheduleConfig } from "@/app/api/schedule/route"

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

// Split lines into chunks that fit within ntfy's ~4096 byte body limit
function chunkLines(lines: string[], maxChars = 3500): string[] {
  const chunks: string[] = []
  let current = ""
  for (const line of lines) {
    const addition = (current ? "\n" : "") + line
    if (current.length + addition.length > maxChars) {
      if (current) chunks.push(current)
      current = line
    } else {
      current += addition
    }
  }
  if (current) chunks.push(current)
  return chunks
}

async function ntfyPost(server: string, topic: string, headers: Record<string, string>, body: string): Promise<boolean> {
  try {
    const res = await fetch(`${server}/${topic}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
      body,
    })
    return res.ok
  } catch {
    return false
  }
}

interface SendConfig {
  topic: string
  ntfyServer: string
  savedQuery: string
  dismissedIds?: string[]
}

async function sendNotification(config: SendConfig): Promise<{ ok: boolean; error?: string; title?: string }> {
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
  const imageItems = items.filter(i => !["metar","taf","notam","sigmet","airmet","pirep","upperwind","space_weather"].includes(i.type))

  const title    = `${sites.join("/")} Weather Brief - ${timeStr}`
  const priority = sigmets.length > 0 ? "4" : airmets.length > 0 ? "3" : "2"
  const tags     = sigmets.length > 0 ? "warning,airplane" : "airplane"

  // 1 — NOTAMs (sent first = appears lowest in notification shade)
  if (notams.length > 0) {
    const notamLines = notams.flatMap(n => {
      const p = extractNotamSummary(n.text)
      return p ? [`${p.id}: ${p.summary}`] : []
    })
    const chunks = chunkLines(notamLines)
    for (let i = 0; i < chunks.length; i++) {
      const suffix = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ""
      await ntfyPost(config.ntfyServer, config.topic, {
        Title: `${sites.join("/")} NOTAMs${suffix} - ${timeStr}`,
        Priority: "2",
        Tags: "memo",
      }, chunks[i])
    }
  }

  // 2 — Graphical products (one attachment per image)
  for (const item of imageItems) {
    try {
      const data = JSON.parse(item.text)
      if (!data.frame_lists) continue
      // Get the latest frame from the first frame_list
      const firstList = data.frame_lists[0]
      if (!firstList?.frames?.length) continue
      const latestFrame = firstList.frames[firstList.frames.length - 1]
      if (!latestFrame?.images?.length) continue
      const imageId = latestFrame.images[latestFrame.images.length - 1].id
      const imageUrl = `https://plan.navcanada.ca/weather/images/${imageId}.image`
      const label = item.type.replace(/_/g, " ").toUpperCase()
      await ntfyPost(config.ntfyServer, config.topic, {
        Title: `${label} - ${timeStr}`,
        Priority: "2",
        Tags: "world_map",
        Attach: imageUrl,
      }, label)
    } catch {
      // skip malformed image item
    }
  }

  // 3 — Weather summary per aerodrome (sent last = appears on top)
  const summaryLines: string[] = []
  if (sigmets.length > 0) summaryLines.push(`⚠️ ${sigmets.length} SIGMET${sigmets.length > 1 ? "s" : ""} ACTIVE`)
  if (airmets.length > 0) summaryLines.push(`⚠️ ${airmets.length} AIRMET${airmets.length > 1 ? "s" : ""} ACTIVE`)
  if (pireps.length > 0)  summaryLines.push(`✈️ ${pireps.length} PIREP${pireps.length > 1 ? "s" : ""}`)
  for (const site of sites) {
    const metar = metars.find(i => i.location === site)
    const taf   = tafs.find(i => i.location === site)
    if (metar || taf) summaryLines.push("")
    if (metar) summaryLines.push(`📡 ${metar.text.trim()}`)
    if (taf)   summaryLines.push(`📋 ${taf.text.trim()}`)
  }

  const summaryChunks = chunkLines(summaryLines)
  for (let i = 0; i < summaryChunks.length; i++) {
    const suffix = summaryChunks.length > 1 ? ` (${i + 1}/${summaryChunks.length})` : ""
    const ok = await ntfyPost(config.ntfyServer, config.topic, {
      Title: `${title}${suffix}`,
      Priority: priority,
      Tags: tags,
    }, summaryChunks[i])
    if (!ok && i === 0) return { ok: false, error: "ntfy delivery failed" }
  }

  return { ok: true, title }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const isCronCall = !sp.has("topic")

  // ── Cron path ────────────────────────────────────────────────────────────────
  // Called every hour by an external cron (e.g. cron-job.org). Iterates all
  // stored user schedules. Requires Authorization: Bearer <CRON_SECRET> header.
  if (isCronCall) {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const auth = request.headers.get("authorization")
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const currentHour = new Date().getUTCHours()

    let schedules: ScheduleConfig[]
    try {
      schedules = await getSchedulesDueAt(currentHour)
    } catch {
      // KV not configured — fall back to env var single-user mode
      schedules = []
    }

    // Env var single-user fallback (for the site owner without KV)
    if (schedules.length === 0 && process.env.NTFY_TOPIC) {
      const hoursEnv = process.env.NOTIFY_HOURS
      if (!hoursEnv || hoursEnv.split(",").map(h => parseInt(h)).includes(currentHour)) {
        const result = await sendNotification({
          topic: process.env.NTFY_TOPIC,
          ntfyServer: (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, ""),
          savedQuery: process.env.NOTIFY_QUERY || `site=${process.env.NOTIFY_SITES || "CYYZ"}`,
        })
        return NextResponse.json({ ok: true, sent: result.ok ? 1 : 0, results: [result] })
      }
      return NextResponse.json({ ok: true, skipped: true, reason: "Not a scheduled hour" })
    }

    if (schedules.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: "No schedules due at this hour" })
    }

    // Send all due schedules (in parallel)
    const results = await Promise.all(
      schedules.map(s => sendNotification({
        topic: s.topic,
        ntfyServer: s.server,
        savedQuery: s.savedQuery,
        dismissedIds: s.dismissedIds,
      }))
    )

    const sent = results.filter(r => r.ok).length
    return NextResponse.json({ ok: true, sent, total: schedules.length, results })
  }

  // ── User-triggered path ─────────────────────────────────────────────────────
  // Called directly with ?topic=... from the UI or a bookmarked URL.
  const topic = sp.get("topic")!
  const ntfyServer = (sp.get("server") || "https://ntfy.sh").replace(/\/$/, "")

  // Build query from URL params
  const navUrl = new URL("https://plan.navcanada.ca/weather/api/alpha/")
  const sites = sp.getAll("site")
  if (sites.length === 0) {
    return NextResponse.json({ error: "Missing required param: site" }, { status: 400 })
  }
  sites.forEach(s => navUrl.searchParams.append("site", s))
  const alphas = sp.getAll("alpha").filter(a =>
    ["metar", "taf", "notam", "sigmet", "airmet", "pirep", "upperwind", "space_weather"].includes(a)
  )
  ;(alphas.length ? alphas : ["metar", "taf", "notam", "sigmet", "airmet", "pirep"])
    .forEach(a => navUrl.searchParams.append("alpha", a))
  navUrl.searchParams.set("notam_choice", sp.get("notam_choice") || "default")

  const savedQuery = navUrl.searchParams.toString()
  const result = await sendNotification({ topic, ntfyServer, savedQuery })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, title: result.title, sites })
}
