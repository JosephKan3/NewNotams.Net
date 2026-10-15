import { getDb, tableName, userPk, emailPk, SK } from "@/lib/db"
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb"
import { scrypt, randomBytes, timingSafeEqual, randomUUID, createHash } from "crypto"
import { promisify } from "util"

const scryptAsync = promisify(scrypt)

export interface StoredUser {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: string
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex")
  const buf = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${buf.toString("hex")}`
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, stored] = hash.split(":")
  if (!salt || !stored) return false
  const storedBuf = Buffer.from(stored, "hex")
  const derivedBuf = (await scryptAsync(password, salt, 64)) as Buffer
  return timingSafeEqual(storedBuf, derivedBuf)
}

async function getUserById(id: string): Promise<StoredUser | null> {
  const { Item } = await getDb().send(
    new GetCommand({ TableName: tableName(), Key: { pk: userPk(id), sk: SK.profile } }),
  )
  return (Item as StoredUser | undefined) ?? null
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const { Item } = await getDb().send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: emailPk(email), sk: SK.emailLookup },
    }),
  )
  const id = (Item as { userId: string } | undefined)?.userId
  if (!id) return null
  return getUserById(id)
}

// Email registration and the email->id lookup are written in one
// transaction, conditioned on the email item not already existing —
// closes a real (if narrow) race the original KV version had: two
// concurrent sign-ups for the same email both reading "not found" before
// either had written. DynamoDB's ConditionExpression makes this atomic
// instead of relying on being first to read.
export async function createUser(email: string, password: string): Promise<StoredUser> {
  const normalizedEmail = email.toLowerCase()
  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  const user: StoredUser = {
    id,
    email: normalizedEmail,
    name: normalizedEmail.split("@")[0],
    passwordHash,
    createdAt: new Date().toISOString(),
  }

  try {
    await getDb().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName(),
              Item: { pk: emailPk(normalizedEmail), sk: SK.emailLookup, userId: id },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          {
            Put: {
              TableName: tableName(),
              Item: { pk: userPk(id), sk: SK.profile, ...user },
            },
          },
        ],
      }),
    )
  } catch (e) {
    if ((e as { name?: string }).name === "TransactionCanceledException") {
      throw new Error("Email already registered")
    }
    throw e
  }

  return user
}

// Used by OAuth sign-ins: finds existing user by email or creates one (no password).
//
// The id is derived deterministically from the email (rather than a random
// UUID) so that the same OAuth account always maps to the same id — and
// therefore the same SEARCHES/DISMISSALS/SCHEDULE items — even if the
// email lookup item is ever missing. This also self-heals that lookup item
// on every sign-in.
export async function findOrCreateOAuthUser(
  email: string,
  name: string | null,
): Promise<StoredUser> {
  const normalizedEmail = email.toLowerCase()
  const id = createHash("sha256").update(normalizedEmail).digest("hex")

  const existing = await getUserById(id)
  if (existing) {
    await getDb().send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName(),
              Item: { pk: emailPk(normalizedEmail), sk: SK.emailLookup, userId: id },
            },
          },
        ],
      }),
    )
    return existing
  }

  const user: StoredUser = {
    id,
    email: normalizedEmail,
    name: name ?? normalizedEmail.split("@")[0],
    passwordHash: "",
    createdAt: new Date().toISOString(),
  }
  await getDb().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName(),
            Item: { pk: userPk(id), sk: SK.profile, ...user },
          },
        },
        {
          Put: {
            TableName: tableName(),
            Item: { pk: emailPk(normalizedEmail), sk: SK.emailLookup, userId: id },
          },
        },
      ],
    }),
  )
  return user
}
