import webpush from "web-push"
import { getDb, tableName, userPk, SK } from "@/lib/db"
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb"

export interface PushSubscriptionData {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

let configured = false

function ensureConfigured() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  configured = true
}

export async function getPushSubscriptions(userId: string): Promise<PushSubscriptionData[]> {
  const { Item } = await getDb().send(
    new GetCommand({ TableName: tableName(), Key: { pk: userPk(userId), sk: SK.pushSubs } }),
  )
  return (Item as { subs?: PushSubscriptionData[] } | undefined)?.subs ?? []
}

async function putPushSubscriptions(userId: string, subs: PushSubscriptionData[]): Promise<void> {
  await getDb().send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: userPk(userId), sk: SK.pushSubs, subs },
    }),
  )
}

export async function addPushSubscription(userId: string, sub: PushSubscriptionData): Promise<void> {
  const existing = await getPushSubscriptions(userId)
  const filtered = existing.filter((s) => s.endpoint !== sub.endpoint)
  filtered.push(sub)
  await putPushSubscriptions(userId, filtered)
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  const existing = await getPushSubscriptions(userId)
  await putPushSubscriptions(userId, existing.filter((s) => s.endpoint !== endpoint))
}

// Sends a push notification, returning whether the subscription is expired/invalid
// (404/410) so the caller can prune it from storage.
export async function sendPush(
  sub: PushSubscriptionData,
  payload: PushPayload,
): Promise<{ ok: boolean; expired?: boolean }> {
  ensureConfigured()
  try {
    await webpush.sendNotification(sub as webpush.PushSubscription, JSON.stringify(payload))
    return { ok: true }
  } catch (e) {
    const statusCode = (e as { statusCode?: number })?.statusCode
    if (statusCode === 404 || statusCode === 410) {
      return { ok: false, expired: true }
    }
    return { ok: false }
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const subs = await getPushSubscriptions(userId)
  if (subs.length === 0) return 0

  let sent = 0
  const expired: string[] = []
  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPush(sub, payload)
      if (result.ok) sent++
      else if (result.expired) expired.push(sub.endpoint)
    }),
  )

  if (expired.length > 0) {
    const remaining = subs.filter((s) => !expired.includes(s.endpoint))
    await putPushSubscriptions(userId, remaining)
  }

  return sent
}
