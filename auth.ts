import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import GitHub from "next-auth/providers/github"
import Apple from "next-auth/providers/apple"
import Discord from "next-auth/providers/discord"
import Facebook from "next-auth/providers/facebook"
import Twitter from "next-auth/providers/twitter"
import AzureAD from "next-auth/providers/azure-ad"
import LinkedIn from "next-auth/providers/linkedin"
import Twitch from "next-auth/providers/twitch"
import Spotify from "next-auth/providers/spotify"
import { getUserByEmail, verifyPassword, findOrCreateOAuthUser } from "@/lib/user-store"

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Credentials login is optional — guests use localStorage.
 * OAuth providers activate when their env vars are set:
 *
 *   AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
 *   AUTH_GITHUB_ID / AUTH_GITHUB_SECRET
 *   AUTH_APPLE_ID / AUTH_APPLE_SECRET
 *   AUTH_DISCORD_ID / AUTH_DISCORD_SECRET
 *   AUTH_FACEBOOK_ID / AUTH_FACEBOOK_SECRET
 *   AUTH_TWITTER_ID / AUTH_TWITTER_SECRET
 *   AUTH_AZURE_AD_ID / AUTH_AZURE_AD_SECRET / AUTH_AZURE_AD_TENANT_ID
 *   AUTH_LINKEDIN_ID / AUTH_LINKEDIN_SECRET
 *   AUTH_TWITCH_ID / AUTH_TWITCH_SECRET
 *   AUTH_SPOTIFY_ID / AUTH_SPOTIFY_SECRET
 */

const oauthProviders = [
  process.env.AUTH_GOOGLE_ID
    ? Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET! })
    : null,
  process.env.AUTH_GITHUB_ID
    ? GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET! })
    : null,
  process.env.AUTH_APPLE_ID
    ? Apple({ clientId: process.env.AUTH_APPLE_ID, clientSecret: process.env.AUTH_APPLE_SECRET! })
    : null,
  process.env.AUTH_DISCORD_ID
    ? Discord({ clientId: process.env.AUTH_DISCORD_ID, clientSecret: process.env.AUTH_DISCORD_SECRET! })
    : null,
  process.env.AUTH_FACEBOOK_ID
    ? Facebook({ clientId: process.env.AUTH_FACEBOOK_ID, clientSecret: process.env.AUTH_FACEBOOK_SECRET! })
    : null,
  process.env.AUTH_TWITTER_ID
    ? Twitter({ clientId: process.env.AUTH_TWITTER_ID, clientSecret: process.env.AUTH_TWITTER_SECRET! })
    : null,
  process.env.AUTH_AZURE_AD_ID
    ? AzureAD({
        clientId: process.env.AUTH_AZURE_AD_ID,
        clientSecret: process.env.AUTH_AZURE_AD_SECRET!,
        tenantId: process.env.AUTH_AZURE_AD_TENANT_ID,
      })
    : null,
  process.env.AUTH_LINKEDIN_ID
    ? LinkedIn({ clientId: process.env.AUTH_LINKEDIN_ID, clientSecret: process.env.AUTH_LINKEDIN_SECRET! })
    : null,
  process.env.AUTH_TWITCH_ID
    ? Twitch({ clientId: process.env.AUTH_TWITCH_ID, clientSecret: process.env.AUTH_TWITCH_SECRET! })
    : null,
  process.env.AUTH_SPOTIFY_ID
    ? Spotify({ clientId: process.env.AUTH_SPOTIFY_ID, clientSecret: process.env.AUTH_SPOTIFY_SECRET! })
    : null,
].filter((p) => p !== null)

export const { handlers, signIn, signOut, auth } = NextAuth({
  // @ts-expect-error -- trustHost is a valid v5 option; bundled types are still v4
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
  providers: [
    ...oauthProviders,
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

        try {
          const user = await getUserByEmail(email)
          if (!user) return null
          const ok = await verifyPassword(password, user.passwordHash)
          if (!ok) return null
          return { id: user.id, email: user.email, name: user.name }
        } catch {
          return null
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // For OAuth sign-ins, find or create a Redis user keyed by email,
      // then override user.id so our internal ID ends up in the JWT.
      if (account?.type === "oauth" && user.email) {
        try {
          const stored = await findOrCreateOAuthUser(user.email, user.name ?? null)
          user.id = stored.id
        } catch {
          return false
        }
      }
      return true
    },
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
