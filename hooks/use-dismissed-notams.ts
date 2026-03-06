"use client"

import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "newnotams-dismissed"

export function useDismissedNotams() {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        setDismissedIds(new Set(parsed))
      }
    } catch (error) {
      console.error("Failed to load dismissed NOTAMs:", error)
    }
    setIsLoaded(true)
  }, [])

  // Save to localStorage whenever dismissedIds changes
  useEffect(() => {
    if (!isLoaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissedIds]))
    } catch (error) {
      console.error("Failed to save dismissed NOTAMs:", error)
    }
  }, [dismissedIds, isLoaded])

  const dismiss = useCallback((id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const restore = useCallback((id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const restoreAll = useCallback(() => {
    setDismissedIds(new Set())
  }, [])

  const isDismissed = useCallback((id: string) => {
    return dismissedIds.has(id)
  }, [dismissedIds])

  return {
    dismissedIds: [...dismissedIds],
    dismiss,
    restore,
    restoreAll,
    isDismissed,
    isLoaded,
  }
}
