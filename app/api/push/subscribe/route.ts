import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { addPushSubscription, removePushSubscription, getPushSubscriptions } from "@/lib/push"
import type { PushSubscriptionData } from "@/lib/push"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const subscriptions = await getPushSubscriptions(session.user.id)
  return NextResponse.json({ subscriptions })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { subscription?: PushSubscriptionData }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const subscription = body.subscription
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
  }

  await addPushSubscription(session.user.id, subscription)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { endpoint?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 })
  }

  await removePushSubscription(session.user.id, body.endpoint)
  return NextResponse.json({ ok: true })
}
