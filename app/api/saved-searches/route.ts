import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getKv } from "@/lib/kv"
import type { SavedSearch } from "@/lib/saved-searches"

function searchesKey(userId: string) {
  return `searches:${userId}`
}

async function loadSearches(userId: string): Promise<SavedSearch[]> {
  return (await getKv().get<SavedSearch[]>(searchesKey(userId))) ?? []
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const searches = await loadSearches(session.user.id)
  return NextResponse.json({ searches })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { search?: SavedSearch }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const search = body.search
  if (!search || !search.id || !search.name) {
    return NextResponse.json({ error: "Missing search data" }, { status: 400 })
  }

  const existing = await loadSearches(session.user.id)
  const updated = [...existing.filter((s) => s.id !== search.id), search]
  await getKv().set(searchesKey(session.user.id), updated)
  return NextResponse.json({ ok: true, search })
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const id = new URL(request.url).searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const existing = await loadSearches(session.user.id)
  const updated = existing.filter((s) => s.id !== id)
  await getKv().set(searchesKey(session.user.id), updated)
  return NextResponse.json({ ok: true })
}
