"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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
import {
  loginAction,
  registerAction,
  type AuthActionState,
} from "@/app/actions/auth"

const INITIAL: AuthActionState = { ok: false, error: null }

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional context message, e.g. "Sign in to schedule alerts." */
  reason?: string
}

export function AuthDialog({ open, onOpenChange, reason }: AuthDialogProps) {
  const router = useRouter()
  const [tab, setTab] = useState<"login" | "register">("login")

  const [loginState, loginSubmit, loginPending] = useActionState(
    loginAction,
    INITIAL,
  )
  const [registerState, registerSubmit, registerPending] = useActionState(
    registerAction,
    INITIAL,
  )

  // Close + refresh when either action succeeds.
  useEffect(() => {
    if (loginState.ok || registerState.ok) {
      onOpenChange(false)
      router.refresh()
    }
  }, [loginState.ok, registerState.ok, onOpenChange, router])

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

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "login" | "register")}
          className="pt-2"
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
