import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getKv } from "@/lib/kv"
import { SCHEDULE_USER_IDS_KEY, getSchedulesDueAt, scheduleKey } from "@/lib/notify"
import type { ScheduleConfig } from "@/lib/notify"

// Re-exported for backward compatibility with any existing import of
// `getSchedulesDueAt`/`ScheduleConfig` from this route module — the real
// implementation now lives in lib/notify.ts so it is importable from a
// plain Lambda handler with no Next.js runtime underneath it.
export { getSchedulesDueAt }
export type { ScheduleConfig }

// GET /api/schedule — fetch the signed-in user's schedule
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const config = await getKv().get<ScheduleConfig>(scheduleKey(session.user.id))
    if (!config) return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    return NextResponse.json(config)
  } catch {
    return NextResponse.json({ error: "KV unavailable" }, { status: 503 })
  }
}

// POST /api/schedule — create or update the signed-in user's schedule
export async function POST(request: Request) {
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

  const { notifyHours, savedQuery, dismissedIds, filterDismissed } = body

  if (!notifyHours?.length) {
    return NextResponse.json({ error: "Select at least one notify hour" }, { status: 400 })
  }
  if (!savedQuery) {
    return NextResponse.json({ error: "No search query saved" }, { status: 400 })
  }

  const config: ScheduleConfig = {
    userId: session.user.id,
    notifyHours,
    savedQuery,
    dismissedIds: dismissedIds ?? [],
    filterDismissed: filterDismissed ?? false,
    createdAt: new Date().toISOString(),
  }

  try {
    await getKv().set(scheduleKey(session.user.id), config)
    await getKv().sadd(SCHEDULE_USER_IDS_KEY, session.user.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "KV unavailable — scheduled notifications require Vercel KV to be configured" }, { status: 503 })
  }
}

// PATCH /api/schedule — update dismissed IDs only
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { dismissedIds: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const existing = await getKv().get<ScheduleConfig>(scheduleKey(session.user.id))
    if (!existing) return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    await getKv().set(scheduleKey(session.user.id), { ...existing, dismissedIds: body.dismissedIds ?? [] })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "KV unavailable" }, { status: 503 })
  }
}

// DELETE /api/schedule — remove the signed-in user's schedule
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await getKv().del(scheduleKey(session.user.id))
    await getKv().srem(SCHEDULE_USER_IDS_KEY, session.user.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "KV unavailable" }, { status: 503 })
  }
}
