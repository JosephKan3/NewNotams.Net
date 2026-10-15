import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getDb, tableName, userPk, SK } from "@/lib/db"
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb"
import type { SavedSearch } from "@/lib/saved-searches"

async function loadSearches(userId: string): Promise<SavedSearch[]> {
  const { Item } = await getDb().send(
    new GetCommand({ TableName: tableName(), Key: { pk: userPk(userId), sk: SK.searches } }),
  )
  return (Item as { items?: SavedSearch[] } | undefined)?.items ?? []
}

async function saveSearches(userId: string, searches: SavedSearch[]): Promise<void> {
  await getDb().send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: userPk(userId), sk: SK.searches, items: searches },
    }),
  )
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
  await saveSearches(session.user.id, updated)
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
  await saveSearches(session.user.id, updated)
  return NextResponse.json({ ok: true })
}
