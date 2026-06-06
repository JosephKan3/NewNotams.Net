"use server"

import { signIn, signOut } from "@/auth"
import { AuthError } from "next-auth"

export type AuthActionState = {
  ok: boolean
  error: string | null
}

/**
 * Sign in with email + password.
 * The actual credential verification happens in auth.ts `authorize`.
 */
export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." }
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    return { ok: true, error: null }
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "Invalid email or password." }
    }
    throw error
  }
}

/**
 * Register a new account, then sign in.
 *
 * TODO(backend): create the user record (hash the password, store email)
 * before calling signIn. Until then this returns a friendly message.
 */
export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")
  const confirm = String(formData.get("confirm") || "")

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." }
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." }
  }
  if (password !== confirm) {
    return { ok: false, error: "Passwords do not match." }
  }

  // TODO(backend): persist the new user here, e.g.
  //   await createUser({ email, passwordHash: await hash(password) })
  // then fall through to signIn below.

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    return { ok: true, error: null }
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        error: "Account storage isn't connected yet. Please try again later.",
      }
    }
    throw error
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false })
}
