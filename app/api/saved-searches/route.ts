import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { SavedSearch } from "@/lib/saved-searches"

/**
 * Per-user saved searches.
 *
 * All handlers require an authenticated session and are scoped to
 * `session.user.id`. The storage calls are left as TODOs for the backend —
 * wire them to your store (KV / Postgres) keyed by user id.
 *
 *   GET    -> list this user's saved searches
 *   POST   -> create/replace a saved search ({ search: SavedSearch })
 *   DELETE -> remove a saved search (?id=...)
 */

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // TODO(backend): load saved searches for session.user.id
  //   const searches = await getSavedSearches(session.user.id)
  const searches: SavedSearch[] = []
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

  // TODO(backend): persist `search` for session.user.id
  //   await upsertSavedSearch(session.user.id, search)
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

  // TODO(backend): delete saved search `id` for session.user.id
  //   await deleteSavedSearch(session.user.id, id)
  return NextResponse.json({ ok: true })
}
