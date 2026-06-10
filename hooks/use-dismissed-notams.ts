"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import type { DismissedNotamMeta } from "@/lib/types"

const STORAGE_KEY = "newnotams-dismissed-v2"
const LEGACY_KEY = "newnotams-dismissed"

// Re-export so existing imports from this file continue to work.
export type { DismissedNotamMeta }

function loadLocal(): Record<string, DismissedNotamMeta> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
    // Migrate from legacy format (ids-only array)
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const ids = JSON.parse(legacy) as string[]
      const migrated: Record<string, DismissedNotamMeta> = {}
      ids.forEach((id) => {
        migrated[id] = { id, raw: "", location: null }
      })
      return migrated
    }
  } catch (error) {
    console.error("Failed to load dismissed NOTAMs:", error)
  }
  return {}
}

export function useDismissedNotams() {
  const { status } = useSession()
  const isAuthed = status === "authenticated"

  const [dismissed, setDismissed] = useState<Record<string, DismissedNotamMeta>>({})
  const [isLoaded, setIsLoaded] = useState(false)
  // Tracks the backend we last loaded from, so the persistence effect
  // doesn't write guest data to the user's account (or vice versa).
  const sourceRef = useRef<"local" | "user" | null>(null)

  // Load from the active backend whenever auth status settles.
  useEffect(() => {
    if (status === "loading") return
    let cancelled = false

    async function load() {
      if (isAuthed) {
        try {
          const res = await fetch("/api/dismissals")
          if (res.ok) {
            const json = await res.json()
            const map: Record<string, DismissedNotamMeta> = {}
            for (const d of json.dismissed ?? []) map[d.id] = d
            if (!cancelled) {
              setDismissed(map)
              sourceRef.current = "user"
            }
          }
        } catch {
          if (!cancelled) {
            setDismissed({})
            sourceRef.current = "user"
          }
        }
      } else {
        if (!cancelled) {
          setDismissed(loadLocal())
          sourceRef.current = "local"
        }
      }
      if (!cancelled) setIsLoaded(true)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [status, isAuthed])

  // Persist to the active backend.
  useEffect(() => {
    if (!isLoaded || sourceRef.current === null) return

    if (sourceRef.current === "local") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed))
      } catch (error) {
        console.error("Failed to save dismissed NOTAMs:", error)
      }
    } else if (sourceRef.current === "user") {
      // Replace the user's full dismissal set on the server.
      fetch("/api/dismissals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed: Object.values(dismissed) }),
      }).catch((error) => {
        console.error("Failed to sync dismissed NOTAMs:", error)
      })
    }
  }, [dismissed, isLoaded])

  const dismiss = useCallback((id: string, raw: string, location: string | null) => {
    setDismissed((prev) => ({ ...prev, [id]: { id, raw, location } }))
  }, [])

  const restore = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const restoreAll = useCallback(() => {
    setDismissed({})
  }, [])

  const isDismissed = useCallback(
    (id: string) => {
      return id in dismissed
    },
    [dismissed],
  )

  return {
    // Array of IDs for backward compat (NotifySettings)
    dismissedIds: Object.keys(dismissed),
    // Full metadata for global display
    dismissedNotams: Object.values(dismissed),
    dismiss,
    restore,
    restoreAll,
    isDismissed,
    isLoaded,
  }
}
