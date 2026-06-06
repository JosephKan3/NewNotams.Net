import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Login is OPTIONAL across the app — guests can search freely and their
 * dismissals / saved searches live in localStorage. Logging in lets the
 * backend persist that data per user id instead.
 *
 * NOTE FOR BACKEND: the `authorize` callback below is intentionally a
 * scaffold. Wire it up to your user store (verify email + hashed password,
 * return a user object with a stable `id`). Returning `null` rejects the
 * sign-in attempt. Everything else (session, JWT, route handlers) is ready.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    // We use a custom in-app dialog, but this keeps redirects sane.
    signIn: "/",
  },
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email.trim() : ""
        const password =
          typeof credentials?.password === "string" ? credentials.password : ""

        if (!email || !password) return null

        // TODO(backend): replace this scaffold with a real lookup, e.g.
        //   const user = await getUserByEmail(email)
        //   if (!user) return null
        //   const ok = await verifyPassword(password, user.passwordHash)
        //   if (!ok) return null
        //   return { id: user.id, email: user.email, name: user.name }
        //
        // Until the backend is wired up, no credentials are accepted.
        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
