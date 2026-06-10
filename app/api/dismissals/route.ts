import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getKv } from "@/lib/kv"
import type { DismissedNotamMeta } from "@/lib/types"

function dismissalsKey(userId: string) {
  return `dismissals:${userId}`
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dismissed =
    (await getKv().get<DismissedNotamMeta[]>(dismissalsKey(session.user.id))) ?? []
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

  await getKv().set(dismissalsKey(session.user.id), body.dismissed)
  return NextResponse.json({ ok: true })
}
