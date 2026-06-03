"use client"

import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "newnotams-dismissed-v2"
const LEGACY_KEY = "newnotams-dismissed"

export interface DismissedNotamMeta {
  id: string
  raw: string
  location: string | null
}

export function useDismissedNotams() {
  const [dismissed, setDismissed] = useState<Record<string, DismissedNotamMeta>>({})
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setDismissed(JSON.parse(stored))
      } else {
        // Migrate from legacy format (ids-only array)
        const legacy = localStorage.getItem(LEGACY_KEY)
        if (legacy) {
          const ids = JSON.parse(legacy) as string[]
          const migrated: Record<string, DismissedNotamMeta> = {}
          ids.forEach(id => { migrated[id] = { id, raw: "", location: null } })
          setDismissed(migrated)
        }
      }
    } catch (error) {
      console.error("Failed to load dismissed NOTAMs:", error)
    }
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed))
    } catch (error) {
      console.error("Failed to save dismissed NOTAMs:", error)
    }
  }, [dismissed, isLoaded])

  const dismiss = useCallback((id: string, raw: string, location: string | null) => {
    setDismissed(prev => ({ ...prev, [id]: { id, raw, location } }))
  }, [])

  const restore = useCallback((id: string) => {
    setDismissed(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const restoreAll = useCallback(() => {
    setDismissed({})
  }, [])

  const isDismissed = useCallback((id: string) => {
    return id in dismissed
  }, [dismissed])

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
