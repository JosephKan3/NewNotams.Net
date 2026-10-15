// Shared DynamoDB client and key-building helpers for the single-table
// design (Phase 2: migrated off Upstash Redis — see NewNotamsStack's
// `createTable` doc comment for the item-shape rationale).
//
// One table, PK=`USER#<id>` for every per-user item, distinguished by SK.
// A standalone `EMAIL#<email>` item backs the email→id lookup Auth.js
// needs before it has a user id. `gsi1` backs exactly one query: "every
// schedule due this UTC hour" — see scheduleHourMarkerKey.
//
// Mirrors lib/kv.ts's lazy-singleton-client pattern.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"

let _db: DynamoDBDocumentClient | null = null

export function getDb(): DynamoDBDocumentClient {
  if (!_db) {
    _db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    })
  }
  return _db
}

export function tableName(): string {
  const name = process.env.NEWNOTAMS_TABLE_NAME
  if (!name) throw new Error("NEWNOTAMS_TABLE_NAME is not set")
  return name
}

export const SCHEDULE_HOUR_INDEX = "gsi1"

export function userPk(userId: string): string {
  return `USER#${userId}`
}

export function emailPk(email: string): string {
  return `EMAIL#${email.toLowerCase()}`
}

export const SK = {
  profile: "PROFILE",
  searches: "SEARCHES",
  dismissals: "DISMISSALS",
  pushSubs: "PUSH_SUBS",
  schedule: "SCHEDULE",
  // The email->id lookup item's own SK. Its PK (emailPk) is already the
  // email, so the SK only needs to be a fixed, non-colliding label — unlike
  // every USER# item's SK, it does not need to distinguish multiple items
  // under the same PK, since there is exactly one lookup item per email.
  emailLookup: "LOOKUP",
} as const

export function scheduleHourSk(hour: number): string {
  return `SCHEDULE#${hour}`
}

export function scheduleHourGsiPk(hour: number): string {
  return `HOUR#${hour}`
}
