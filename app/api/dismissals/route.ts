import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getDb, tableName, userPk, SK } from "@/lib/db"
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb"
import type { DismissedNotamMeta } from "@/lib/types"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { Item } = await getDb().send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(session.user.id), sk: SK.dismissals },
    }),
  )
  const dismissed = (Item as { items?: DismissedNotamMeta[] } | undefined)?.items ?? []
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

  await getDb().send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: userPk(session.user.id), sk: SK.dismissals, items: body.dismissed },
    }),
  )
  return NextResponse.json({ ok: true })
}
