import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sendPushToUser } from "@/lib/push"
import { buildNotification } from "@/lib/notify"

// The GET cron path that used to live here is gone — AWS invokes the
// notify Lambda directly via EventBridge Scheduler, so there is no public
// HTTP endpoint for the hourly sweep anymore and CRON_SECRET is unused.
// See Phase 1 action plan §1: "Drop the public GET path entirely... a
// public endpoint only pretending not to be one" is exactly the shape a
// kept-"just in case" bearer-token check would have been. The sweep's own
// logic lives in lambda/notify/index.ts (CDK side) and imports
// lib/notify.ts + lib/push.ts directly, the same modules this route uses.

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
