import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getKv } from "@/lib/kv"

export interface ScheduleConfig {
  id: string
  userId: string
  notifyHours: number[]   // UTC hours to send, e.g. [6, 12, 18]
  savedQuery: string       // raw URLSearchParams query string
  dismissedIds?: string[]  // NOTAM IDs to exclude from notifications
  createdAt: string
}

const SCHEDULE_IDS_KEY = "schedule_ids"

function scheduleKey(id: string) {
  return `schedule:${id}`
}

// GET /api/schedule?id=... — fetch one schedule (must belong to the caller)
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  try {
    const config = await getKv().get<ScheduleConfig>(scheduleKey(id))
    if (!config || config.userId !== session.user.id) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    }
    return NextResponse.json(config)
  } catch {
    return NextResponse.json({ error: "KV unavailable" }, { status: 503 })
  }
}

// POST /api/schedule — create or update a schedule
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Partial<ScheduleConfig>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { id, notifyHours, savedQuery, dismissedIds } = body

  if (!id) {
    return NextResponse.json({ error: "Missing required field: id" }, { status: 400 })
  }
  if (!notifyHours?.length) {
    return NextResponse.json({ error: "Select at least one notify hour" }, { status: 400 })
  }
  if (!savedQuery) {
    return NextResponse.json({ error: "No search query saved" }, { status: 400 })
  }

  const config: ScheduleConfig = {
    id,
    userId: session.user.id,
    notifyHours,
    savedQuery,
    dismissedIds: dismissedIds ?? [],
    createdAt: new Date().toISOString(),
  }

  try {
    await getKv().set(scheduleKey(id), config)
    await getKv().sadd(SCHEDULE_IDS_KEY, id)
    return NextResponse.json({ ok: true, id })
  } catch {
    return NextResponse.json({ error: "KV unavailable — scheduled notifications require Vercel KV to be configured" }, { status: 503 })
  }
}

// PATCH /api/schedule?id=... — update dismissed IDs only
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  let body: { dismissedIds: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const existing = await getKv().get<ScheduleConfig>(scheduleKey(id))
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    }
    await getKv().set(scheduleKey(id), { ...existing, dismissedIds: body.dismissedIds ?? [] })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "KV unavailable" }, { status: 503 })
  }
}

// DELETE /api/schedule?id=... — remove a schedule
export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  try {
    const existing = await getKv().get<ScheduleConfig>(scheduleKey(id))
    if (existing && existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    }
    await getKv().del(scheduleKey(id))
    await getKv().srem(SCHEDULE_IDS_KEY, id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "KV unavailable" }, { status: 503 })
  }
}

// Helper used by the cron job — get all schedules due at a given UTC hour
export async function getSchedulesDueAt(utcHour: number): Promise<ScheduleConfig[]> {
  const ids = await getKv().smembers<string[]>(SCHEDULE_IDS_KEY)
  if (!ids?.length) return []

  const configs = await Promise.all(
    ids.map(id => getKv().get<ScheduleConfig>(scheduleKey(id)))
  )

  return configs.filter(
    (c): c is ScheduleConfig => c !== null && c.notifyHours.includes(utcHour)
  )
}
