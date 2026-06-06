"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { LogIn, LogOut, User, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AuthDialog } from "@/components/auth-dialog"
import { logoutAction } from "@/app/actions/auth"

function initialsFromEmail(email?: string | null) {
  if (!email) return "U"
  return email.slice(0, 2).toUpperCase()
}

export function UserMenu() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [authOpen, setAuthOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSignOut() {
    startTransition(async () => {
      await logoutAction()
      router.refresh()
    })
  }

  if (status === "loading") {
    return (
      <Button variant="ghost" size="icon" disabled title="Loading account">
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    )
  }

  if (!session?.user) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setAuthOpen(true)}
        >
          <LogIn className="h-4 w-4" />
          <span className="hidden sm:inline">Sign in</span>
        </Button>
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      </>
    )
  }

  const email = session.user.email
  const name = session.user.name || email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" title="Account">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">
              {initialsFromEmail(email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <User className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-normal">{name}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={isPending}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {isPending ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
