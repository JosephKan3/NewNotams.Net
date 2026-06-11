import webpush from "web-push"
import { getKv } from "@/lib/kv"

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

function subsKey(userId: string) {
  return `push_subs:${userId}`
}

export async function getPushSubscriptions(userId: string): Promise<PushSubscriptionData[]> {
  return (await getKv().get<PushSubscriptionData[]>(subsKey(userId))) ?? []
}

export async function addPushSubscription(userId: string, sub: PushSubscriptionData): Promise<void> {
  const existing = await getPushSubscriptions(userId)
  const filtered = existing.filter((s) => s.endpoint !== sub.endpoint)
  filtered.push(sub)
  await getKv().set(subsKey(userId), filtered)
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  const existing = await getPushSubscriptions(userId)
  await getKv().set(subsKey(userId), existing.filter((s) => s.endpoint !== endpoint))
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
    await getKv().set(subsKey(userId), remaining)
  }

  return sent
}
