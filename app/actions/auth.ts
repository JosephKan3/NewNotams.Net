"use server"

import { signIn, signOut } from "@/auth"
import { createUser, getUserByEmail } from "@/lib/user-store"

export type AuthActionState = {
  ok: boolean
  error: string | null
}

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
  } catch {
    return { ok: false, error: "Invalid email or password." }
  }
}

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

  try {
    const existing = await getUserByEmail(email)
    if (existing) {
      return { ok: false, error: "An account with that email already exists." }
    }
    await createUser(email, password)
  } catch {
    return { ok: false, error: "Failed to create account. Please try again." }
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    return { ok: true, error: null }
  } catch {
    return { ok: false, error: "Account created — please log in." }
  }
}

export async function oauthSignInAction(provider: string): Promise<void> {
  await signIn(provider, { redirectTo: "/" })
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false })
}
