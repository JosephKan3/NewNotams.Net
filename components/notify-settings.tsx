"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Bell, BellRing, BellOff, Send, CheckCircle, AlertCircle, Check, BookmarkCheck, Calendar, Trash2, RefreshCw, Filter, Lock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { AuthDialog } from "@/components/auth-dialog"

const STORAGE_KEY = "notify_settings_v4"
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""

interface NotifyConfig {
  id: string          // UUID — identifies this user's schedule in KV
  savedQuery: string
  notifyHours: number[]
  isScheduled: boolean
  filterDismissed: boolean
}

function makeId(): string {
  return crypto.randomUUID()
}

const DEFAULT_CONFIG: NotifyConfig = {
  id: "",
  savedQuery: "",
  notifyHours: [12],
  isScheduled: false,
  filterDismissed: false,
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

interface NotifySettingsProps {
  currentQueryString?: string
  dismissedIds?: string[]
}

export function NotifySettings({ currentQueryString, dismissedIds = [] }: NotifySettingsProps) {
  const { status } = useSession()
  const isAuthed = status === "authenticated"
  const [authOpen, setAuthOpen] = useState(false)
  const [config, setConfig] = useState<NotifyConfig>(DEFAULT_CONFIG)
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "ok" | "error">("idle")
  const [sendMessage, setSendMessage] = useState("")
  const [scheduleStatus, setScheduleStatus] = useState<"idle" | "saving" | "ok" | "error" | "removing">("idle")
  const [scheduleMessage, setScheduleMessage] = useState("")
  const [savedNow, setSavedNow] = useState(false)
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "ok" | "error">("idle")

  const [pushSupported, setPushSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const [subscribed, setSubscribed] = useState(false)
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as NotifyConfig
        setConfig({ ...DEFAULT_CONFIG, ...stored, id: stored.id || makeId() })
      } else {
        setConfig(prev => ({ ...prev, id: makeId() }))
      }
    } catch {
      setConfig(prev => ({ ...prev, id: makeId() }))
    }
  }, [])

  useEffect(() => {
    const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
    setPushSupported(supported)
    if (!supported) return

    setPermission(Notification.permission)
    if (!isAuthed) return

    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
    }).catch(() => {})
  }, [isAuthed])

  function save(next: NotifyConfig) {
    setConfig(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function toggleHour(h: number) {
    const next = config.notifyHours.includes(h)
      ? config.notifyHours.filter(x => x !== h)
      : [...config.notifyHours, h]
    save({ ...config, notifyHours: next.length ? next : [h], isScheduled: false })
  }

  function saveCurrentSearch() {
    if (!currentQueryString) return
    save({ ...config, savedQuery: currentQueryString, isScheduled: false })
    setSavedNow(true)
    setTimeout(() => setSavedNow(false), 2000)
  }

  async function enableNotifications() {
    if (!isAuthed) {
      setAuthOpen(true)
      return
    }
    setSubscribing(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== "granted") return

      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      setSubscribed(true)
    } catch {
      // permission denied or subscription failed — leave state as-is
    } finally {
      setSubscribing(false)
    }
  }

  async function disableNotifications() {
    setSubscribing(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setSubscribed(false)
      if (config.isScheduled) {
        await removeSchedule()
      }
    } finally {
      setSubscribing(false)
    }
  }

  async function enableSchedule() {
    if (!isAuthed) {
      setAuthOpen(true)
      return
    }
    if (!subscribed || !config.savedQuery || !config.notifyHours.length) return
    setScheduleStatus("saving")
    setScheduleMessage("")
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: config.id,
          notifyHours: config.notifyHours,
          savedQuery: config.savedQuery,
          dismissedIds: config.filterDismissed ? dismissedIds : [],
        }),
      })
      const json = await res.json()
      if (res.ok) {
        save({ ...config, isScheduled: true })
        setScheduleStatus("ok")
        setScheduleMessage("Schedule saved! You'll receive notifications at your selected times.")
      } else {
        setScheduleStatus("error")
        setScheduleMessage(json.error || "Failed to save schedule")
      }
    } catch {
      setScheduleStatus("error")
      setScheduleMessage("Network error")
    }
  }

  async function syncDismissed() {
    setSyncStatus("syncing")
    try {
      const res = await fetch(`/api/schedule?id=${config.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissedIds }),
      })
      setSyncStatus(res.ok ? "ok" : "error")
      if (res.ok) setTimeout(() => setSyncStatus("idle"), 2000)
    } catch {
      setSyncStatus("error")
    }
  }

  async function removeSchedule() {
    setScheduleStatus("removing")
    try {
      await fetch(`/api/schedule?id=${config.id}`, { method: "DELETE" })
      save({ ...config, isScheduled: false })
      setScheduleStatus("idle")
      setScheduleMessage("")
    } catch {
      setScheduleStatus("error")
      setScheduleMessage("Failed to remove schedule")
    }
  }

  async function sendNow() {
    if (!subscribed) {
      setSendStatus("error")
      setSendMessage("Enable notifications first.")
      return
    }
    if (!config.savedQuery) {
      setSendStatus("error")
      setSendMessage("Save a search first.")
      return
    }
    setSendStatus("sending")
    setSendMessage("")
    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedQuery: config.savedQuery,
          dismissedIds: config.filterDismissed ? dismissedIds : [],
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setSendStatus("ok")
        setSendMessage(`Sent! "${json.title}"`)
      } else {
        setSendStatus("error")
        setSendMessage(json.error || "Unknown error")
      }
    } catch {
      setSendStatus("error")
      setSendMessage("Network error")
    }
  }

  const savedSites = config.savedQuery
    ? new URLSearchParams(config.savedQuery).getAll("site").join(", ")
    : ""

  const canSchedule = subscribed && !!config.savedQuery && config.notifyHours.length > 0

  return (
    <>
    <Dialog onOpenChange={() => { setSendStatus("idle"); setScheduleStatus("idle"); setScheduleMessage(""); setSendMessage("") }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Notification settings">
          <Bell className="h-4 w-4" />
          {config.isScheduled && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500" />
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Push Notifications
            {config.isScheduled && (
              <span className="ml-auto text-xs text-green-600 dark:text-green-400 font-normal">Active</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2 min-w-0">

          {/* Step 1 — Enable browser notifications */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs bg-muted rounded-full px-1.5 py-0.5">1</span>
              Enable notifications on this device
            </Label>
            {!pushSupported ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Push notifications aren&apos;t supported in this browser.
              </div>
            ) : !isAuthed ? (
              <Button variant="outline" className="gap-2 w-full" onClick={() => setAuthOpen(true)}>
                <Lock className="h-3.5 w-3.5" />
                Sign in to enable notifications
              </Button>
            ) : permission === "denied" ? (
              <div className="rounded-md border border-dashed border-destructive/50 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                Notifications are blocked for this site. Enable them in your browser settings.
              </div>
            ) : subscribed ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-md border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                  <BellRing className="h-3.5 w-3.5 shrink-0" />
                  Notifications enabled on this device
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 w-full" disabled={subscribing} onClick={disableNotifications}>
                  {subscribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
                  Disable notifications
                </Button>
              </div>
            ) : (
              <Button className="gap-2 w-full" disabled={subscribing} onClick={enableNotifications}>
                {subscribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                {subscribing ? "Enabling..." : "Enable notifications"}
              </Button>
            )}
          </div>

          {/* Step 2 — Save search */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs bg-muted rounded-full px-1.5 py-0.5">2</span>
              Search query to notify about
            </Label>
            {config.savedQuery ? (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Sites: <span className="text-foreground font-medium font-mono">{savedSites}</span>
                {" · "}
                {new URLSearchParams(config.savedQuery).getAll("alpha").join(", ")}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Run a search first, then click below.
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 w-full"
              disabled={!currentQueryString} onClick={saveCurrentSearch}>
              {savedNow
                ? <><Check className="h-3.5 w-3.5 text-green-500" /> Saved!</>
                : <><BookmarkCheck className="h-3.5 w-3.5" /> {config.savedQuery ? "Update with current search" : "Use current search"}</>
              }
            </Button>
          </div>

          {/* Step 3 — Hour picker */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs bg-muted rounded-full px-1.5 py-0.5">3</span>
              Notify at (UTC) — pick one or more hours
            </Label>
            <div className="grid grid-cols-8 gap-1 w-full">
              {Array.from({ length: 24 }, (_, h) => (
                <button key={h} onClick={() => toggleHour(h)}
                  className={`rounded text-xs py-1 font-mono border transition-colors w-full min-w-0 ${
                    config.notifyHours.includes(h)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/30 hover:bg-muted text-muted-foreground"
                  }`}>
                  {String(h).padStart(2, "0")}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Selected:{" "}
              <span className="font-mono text-foreground">
                {[...config.notifyHours].sort((a, b) => a - b)
                  .map(h => `${String(h).padStart(2, "0")}:00Z`).join(", ")}
              </span>
            </p>
          </div>

          {/* Filter dismissed NOTAMs toggle */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-medium leading-none">Filter dismissed NOTAMs</p>
                {config.filterDismissed && dismissedIds.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{dismissedIds.length} excluded</p>
                )}
              </div>
            </div>
            <button
              role="switch"
              aria-checked={config.filterDismissed}
              onClick={() => save({ ...config, filterDismissed: !config.filterDismissed, isScheduled: false })}
              className={`relative shrink-0 h-5 w-9 rounded-full border-2 transition-colors ${
                config.filterDismissed
                  ? "bg-primary border-primary"
                  : "bg-muted border-border"
              }`}
            >
              <span className={`block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                config.filterDismissed ? "translate-x-4" : "translate-x-0.5"
              }`} />
            </button>
          </div>

          {/* Enable schedule button */}
          <div className="space-y-2">
            {config.isScheduled ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-md border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  Scheduled notifications active
                </div>
                {config.filterDismissed && (
                  <Button variant="outline" size="sm" className="gap-1.5 w-full"
                    disabled={syncStatus === "syncing"} onClick={syncDismissed}>
                    {syncStatus === "ok"
                      ? <><Check className="h-3.5 w-3.5 text-green-500" /> Synced!</>
                      : syncStatus === "error"
                      ? <><AlertCircle className="h-3.5 w-3.5 text-destructive" /> Sync failed</>
                      : <><RefreshCw className={`h-3.5 w-3.5 ${syncStatus === "syncing" ? "animate-spin" : ""}`} />
                          {syncStatus === "syncing" ? "Syncing..." : `Sync dismissed NOTAMs (${dismissedIds.length})`}</>
                    }
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5 w-full text-destructive hover:text-destructive"
                  disabled={scheduleStatus === "removing"} onClick={removeSchedule}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {scheduleStatus === "removing" ? "Removing..." : "Disable scheduled notifications"}
                </Button>
              </div>
            ) : !isAuthed ? (
              <Button variant="outline" className="gap-2 w-full" onClick={() => setAuthOpen(true)}>
                <Lock className="h-3.5 w-3.5" />
                Sign in to schedule notifications
              </Button>
            ) : (
              <Button className="gap-2 w-full" disabled={!canSchedule || scheduleStatus === "saving"} onClick={enableSchedule}>
                <Calendar className="h-3.5 w-3.5" />
                {scheduleStatus === "saving" ? "Saving..." : "Enable scheduled notifications"}
              </Button>
            )}
            {scheduleStatus === "error" && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> {scheduleMessage}
              </p>
            )}
            {scheduleStatus === "ok" && !config.isScheduled && (
              <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4 shrink-0" /> {scheduleMessage}
              </p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Manual / Send now */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Send now (manual)</p>
            <Button onClick={sendNow} disabled={sendStatus === "sending"} variant="outline" className="gap-2 w-full">
              <Send className="h-3.5 w-3.5" />
              {sendStatus === "sending" ? "Sending..." : "Send Test Notification"}
            </Button>
            {sendStatus === "ok" && (
              <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4 shrink-0" /> {sendMessage}
              </p>
            )}
            {sendStatus === "error" && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> {sendMessage}
              </p>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
    <AuthDialog open={authOpen} onOpenChange={setAuthOpen} reason="Sign in to enable push notifications." />
    </>
  )
}
