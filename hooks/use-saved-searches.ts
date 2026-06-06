"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import type { SearchParams } from "@/lib/types"
import { type SavedSearch, makeSearchId } from "@/lib/saved-searches"

const STORAGE_KEY = "newnotams-saved-searches-v1"

function loadLocal(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedSearch[]) : []
  } catch {
    return []
  }
}

function persistLocal(searches: SavedSearch[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches))
  } catch (error) {
    console.error("Failed to save searches:", error)
  }
}

/**
 * Saved searches with two backends:
 *  - logged out: localStorage
 *  - logged in:  /api/saved-searches (scoped to user id)
 */
export function useSavedSearches() {
  const { status } = useSession()
  const isAuthed = status === "authenticated"

  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from the active backend whenever auth status settles.
  useEffect(() => {
    if (status === "loading") return
    let cancelled = false

    async function load() {
      if (isAuthed) {
        try {
          const res = await fetch("/api/saved-searches")
          if (res.ok) {
            const json = await res.json()
            if (!cancelled) setSearches(json.searches ?? [])
          }
        } catch {
          if (!cancelled) setSearches([])
        }
      } else {
        if (!cancelled) setSearches(loadLocal())
      }
      if (!cancelled) setIsLoaded(true)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [status, isAuthed])

  const saveSearch = useCallback(
    async (name: string, params: SearchParams) => {
      const entry: SavedSearch = {
        id: makeSearchId(),
        name: name.trim(),
        params,
        createdAt: Date.now(),
      }
      setSearches((prev) => {
        const next = [...prev.filter((s) => s.name !== entry.name), entry]
        if (!isAuthed) persistLocal(next)
        return next
      })
      if (isAuthed) {
        try {
          await fetch("/api/saved-searches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ search: entry }),
          })
        } catch (error) {
          console.error("Failed to sync saved search:", error)
        }
      }
      return entry
    },
    [isAuthed],
  )

  const deleteSearch = useCallback(
    async (id: string) => {
      setSearches((prev) => {
        const next = prev.filter((s) => s.id !== id)
        if (!isAuthed) persistLocal(next)
        return next
      })
      if (isAuthed) {
        try {
          await fetch(`/api/saved-searches?id=${id}`, { method: "DELETE" })
        } catch (error) {
          console.error("Failed to delete saved search:", error)
        }
      }
    },
    [isAuthed],
  )

  return { searches, saveSearch, deleteSearch, isLoaded, isAuthed }
}
