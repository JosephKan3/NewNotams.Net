/**
 * One-time migration: copies every real user's data from Upstash Redis
 * (the pre-Phase-2 store) into the DynamoDB table NewNotamsStack.createTable
 * provisions.
 *
 * Run once, by hand, with real credentials for both stores — not part of
 * any deploy pipeline, not imported by the app or the Lambda. Idempotent:
 * every write here is a plain overwrite (Put, not a conditional create), so
 * running it twice just re-copies the same data and cannot create
 * duplicates or partial state from a retried run.
 *
 * Reads KV_REST_API_URL/KV_REST_API_TOKEN from the environment the same way
 * lib/kv.ts does, and NEWNOTAMS_TABLE_NAME the same way lib/db.ts does —
 * run it with both the old Upstash creds and the new table name set, e.g.:
 *
 *   KV_REST_API_URL=... KV_REST_API_TOKEN=... \
 *   NEWNOTAMS_TABLE_NAME=... AWS_REGION=us-east-1 \
 *   npx tsx scripts/migrate-upstash-to-dynamodb.ts
 *
 * Discovery is a single SCAN over every key this app ever wrote (no
 * separate "list of user ids" existed in Upstash beyond
 * schedule_user_ids, which only covered users with an active schedule —
 * scanning finds every user, scheduled or not). Keys that reference a user
 * id with no matching user:<id> profile are logged and skipped: confirmed
 * during planning that exactly one such orphan exists in production
 * (a dismissals:<id> key with an empty array and no profile, from a user
 * that no longer exists) — not an error, just dead data not worth carrying
 * forward.
 */

import { Redis } from "@upstash/redis"
import { getDb, tableName, userPk, emailPk, SK, scheduleHourSk, scheduleHourGsiPk } from "../lib/db"
import { PutCommand } from "@aws-sdk/lib-dynamodb"
import type { StoredUser } from "../lib/user-store"
import type { ScheduleConfig } from "../lib/notify"
import type { PushSubscriptionData } from "../lib/push"
import type { SavedSearch } from "../lib/saved-searches"
import type { DismissedNotamMeta } from "../lib/types"

function sourceKv(): Redis {
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })
}

async function scanAllKeys(kv: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | number = 0
  do {
    const result: [string | number, string[]] = await kv.scan(cursor, { match: pattern, count: 200 })
    keys.push(...result[1])
    cursor = result[0]
  } while (cursor !== 0 && cursor !== "0")
  return keys
}

async function putUser(user: StoredUser): Promise<void> {
  await getDb().send(
    new PutCommand({ TableName: tableName(), Item: { pk: userPk(user.id), sk: SK.profile, ...user } }),
  )
  await getDb().send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: emailPk(user.email), sk: SK.emailLookup, userId: user.id },
    }),
  )
}

async function putSearches(userId: string, items: SavedSearch[]): Promise<void> {
  await getDb().send(
    new PutCommand({ TableName: tableName(), Item: { pk: userPk(userId), sk: SK.searches, items } }),
  )
}

async function putDismissals(userId: string, items: DismissedNotamMeta[]): Promise<void> {
  await getDb().send(
    new PutCommand({ TableName: tableName(), Item: { pk: userPk(userId), sk: SK.dismissals, items } }),
  )
}

async function putPushSubs(userId: string, subs: PushSubscriptionData[]): Promise<void> {
  await getDb().send(
    new PutCommand({ TableName: tableName(), Item: { pk: userPk(userId), sk: SK.pushSubs, subs } }),
  )
}

async function putSchedule(config: ScheduleConfig): Promise<void> {
  await getDb().send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: userPk(config.userId), sk: SK.schedule, ...config },
    }),
  )
  for (const hour of config.notifyHours) {
    await getDb().send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          pk: userPk(config.userId),
          sk: scheduleHourSk(hour),
          gsi1pk: scheduleHourGsiPk(hour),
          gsi1sk: userPk(config.userId),
          ...config,
        },
      }),
    )
  }
}

async function main(): Promise<void> {
  const kv = sourceKv()

  const userKeys = await scanAllKeys(kv, "user:*")
  const knownUserIds = new Set(userKeys.map((k) => k.slice("user:".length)))

  console.log(`Found ${userKeys.length} user profile(s): ${[...knownUserIds].join(", ")}`)

  let migratedUsers = 0
  for (const key of userKeys) {
    const user = await kv.get<StoredUser>(key)
    if (!user) continue
    await putUser(user)
    migratedUsers++
    console.log(`  migrated user ${user.id} (${user.email})`)
  }

  const scanned: Record<string, { migrated: number; skippedOrphans: string[] }> = {
    searches: { migrated: 0, skippedOrphans: [] },
    dismissals: { migrated: 0, skippedOrphans: [] },
    push_subs: { migrated: 0, skippedOrphans: [] },
    schedule: { migrated: 0, skippedOrphans: [] },
  }

  for (const key of await scanAllKeys(kv, "searches:*")) {
    const userId = key.slice("searches:".length)
    if (!knownUserIds.has(userId)) {
      scanned.searches!.skippedOrphans.push(key)
      continue
    }
    const items = (await kv.get<SavedSearch[]>(key)) ?? []
    await putSearches(userId, items)
    scanned.searches!.migrated++
  }

  for (const key of await scanAllKeys(kv, "dismissals:*")) {
    const userId = key.slice("dismissals:".length)
    if (!knownUserIds.has(userId)) {
      scanned.dismissals!.skippedOrphans.push(key)
      continue
    }
    const items = (await kv.get<DismissedNotamMeta[]>(key)) ?? []
    await putDismissals(userId, items)
    scanned.dismissals!.migrated++
  }

  for (const key of await scanAllKeys(kv, "push_subs:*")) {
    const userId = key.slice("push_subs:".length)
    if (!knownUserIds.has(userId)) {
      scanned.push_subs!.skippedOrphans.push(key)
      continue
    }
    const subs = (await kv.get<PushSubscriptionData[]>(key)) ?? []
    await putPushSubs(userId, subs)
    scanned.push_subs!.migrated++
  }

  for (const key of await scanAllKeys(kv, "schedule:*")) {
    const userId = key.slice("schedule:".length)
    if (!knownUserIds.has(userId)) {
      scanned.schedule!.skippedOrphans.push(key)
      continue
    }
    const config = await kv.get<ScheduleConfig>(key)
    if (!config) continue
    await putSchedule(config)
    scanned.schedule!.migrated++
  }

  console.log(`\nMigrated ${migratedUsers} user profile(s).`)
  for (const [kind, result] of Object.entries(scanned)) {
    console.log(`${kind}: migrated ${result.migrated}, skipped ${result.skippedOrphans.length} orphan(s)`)
    for (const orphan of result.skippedOrphans) {
      console.log(`  orphan (no matching user profile): ${orphan}`)
    }
  }
}

main()
  .then(() => {
    console.log("\nDone.")
    process.exit(0)
  })
  .catch((e) => {
    console.error("Migration failed:", e)
    process.exit(1)
  })
