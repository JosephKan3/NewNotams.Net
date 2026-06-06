import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { DismissedNotamMeta } from "@/hooks/use-dismissed-notams"

/**
 * Per-user NOTAM dismissals.
 *
 * Requires an authenticated session; scoped to `session.user.id`.
 * Storage calls are TODOs for the backend.
 *
 *   GET  -> list this user's dismissals
 *   PUT  -> replace the full dismissal set ({ dismissed: DismissedNotamMeta[] })
 */

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // TODO(backend): load dismissals for session.user.id
  //   const dismissed = await getDismissals(session.user.id)
  const dismissed: DismissedNotamMeta[] = []
  return NextResponse.json({ dismissed })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { dismissed?: DismissedNotamMeta[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!Array.isArray(body.dismissed)) {
    return NextResponse.json({ error: "Missing dismissed array" }, { status: 400 })
  }

  // TODO(backend): persist the full dismissal set for session.user.id
  //   await setDismissals(session.user.id, body.dismissed)
  return NextResponse.json({ ok: true })
}
