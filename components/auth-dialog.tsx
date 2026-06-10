"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { LogIn, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  loginAction,
  registerAction,
  type AuthActionState,
} from "@/app/actions/auth"

const INITIAL: AuthActionState = { ok: false, error: null }

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  apple: "Apple",
  discord: "Discord",
  facebook: "Facebook",
  twitter: "Twitter / X",
  "azure-ad": "Microsoft",
  linkedin: "LinkedIn",
  twitch: "Twitch",
  spotify: "Spotify",
}

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reason?: string
}

export function AuthDialog({ open, onOpenChange, reason }: AuthDialogProps) {
  const router = useRouter()
  const [tab, setTab] = useState<"login" | "register">("login")
  const [oauthProviders, setOauthProviders] = useState<string[]>([])
  const [oauthPending, setOauthPending] = useState(false)

  const [loginState, loginSubmit, loginPending] = useActionState(
    loginAction,
    INITIAL,
  )
  const [registerState, registerSubmit, registerPending] = useActionState(
    registerAction,
    INITIAL,
  )

  // Fetch available providers from next-auth once when dialog opens.
  useEffect(() => {
    if (!open) return
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data: Record<string, { id: string; type: string }>) => {
        const ids = Object.values(data)
          .filter((p) => p.type !== "credentials")
          .map((p) => p.id)
        setOauthProviders(ids)
      })
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (loginState.ok || registerState.ok) {
      onOpenChange(false)
      router.refresh()
    }
  }, [loginState.ok, registerState.ok, onOpenChange, router])

  function handleOAuth(provider: string) {
    setOauthPending(true)
    signIn(provider, { callbackUrl: "/" })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="h-4 w-4" />
            Account
          </DialogTitle>
          <DialogDescription>
            {reason ??
              "Sign in to sync your dismissals, alerts, and saved searches across devices."}
          </DialogDescription>
        </DialogHeader>

        {/* OAuth provider buttons */}
        {oauthProviders.length > 0 && (
          <div className="space-y-2">
            {oauthProviders.map((id) => (
              <Button
                key={id}
                variant="outline"
                className="w-full"
                disabled={oauthPending}
                onClick={() => handleOAuth(id)}
              >
                {oauthPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Continue with {PROVIDER_LABELS[id] ?? id}
              </Button>
            ))}
            <div className="flex items-center gap-2 py-1">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
          </div>
        )}

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "login" | "register")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Sign in</TabsTrigger>
            <TabsTrigger value="register">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="pt-4">
            <form action={loginSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {loginState.error && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {loginState.error}
                </p>
              )}
              <Button type="submit" className="w-full gap-2" disabled={loginPending}>
                {loginPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {loginPending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register" className="pt-4">
            <form action={registerSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="register-confirm">Confirm password</Label>
                <Input
                  id="register-confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              {registerState.error && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {registerState.error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full gap-2"
                disabled={registerPending}
              >
                {registerPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {registerPending ? "Creating..." : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
