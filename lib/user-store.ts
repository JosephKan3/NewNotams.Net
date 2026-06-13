import { getKv } from "@/lib/kv"
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

function userKey(id: string) {
  return `user:${id}`
}

function emailKey(email: string) {
  return `user_email:${email.toLowerCase()}`
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

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const id = await getKv().get<string>(emailKey(email))
  if (!id) return null
  return getKv().get<StoredUser>(userKey(id))
}

export async function createUser(email: string, password: string): Promise<StoredUser> {
  const normalizedEmail = email.toLowerCase()
  const existingId = await getKv().get<string>(emailKey(normalizedEmail))
  if (existingId) throw new Error("Email already registered")

  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  const user: StoredUser = {
    id,
    email: normalizedEmail,
    name: normalizedEmail.split("@")[0],
    passwordHash,
    createdAt: new Date().toISOString(),
  }
  await getKv().set(userKey(id), user)
  await getKv().set(emailKey(normalizedEmail), id)
  return user
}

// Used by OAuth sign-ins: finds existing user by email or creates one (no password).
//
// The id is derived deterministically from the email (rather than a random
// UUID) so that the same OAuth account always maps to the same id — and
// therefore the same searches:/dismissals:/schedule: keys — even if the
// user_email -> id lookup record is ever missing. This also self-heals that
// lookup record on every sign-in.
export async function findOrCreateOAuthUser(
  email: string,
  name: string | null,
): Promise<StoredUser> {
  const normalizedEmail = email.toLowerCase()
  const id = createHash("sha256").update(normalizedEmail).digest("hex")

  const existing = await getKv().get<StoredUser>(userKey(id))
  if (existing) {
    await getKv().set(emailKey(normalizedEmail), id)
    return existing
  }

  const user: StoredUser = {
    id,
    email: normalizedEmail,
    name: name ?? normalizedEmail.split("@")[0],
    passwordHash: "",
    createdAt: new Date().toISOString(),
  }
  await getKv().set(userKey(id), user)
  await getKv().set(emailKey(normalizedEmail), id)
  return user
}
