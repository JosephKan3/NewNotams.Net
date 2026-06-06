"use client"

import { useState } from "react"
import { Bookmark, BookmarkPlus, Trash2, Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useSavedSearches } from "@/hooks/use-saved-searches"
import type { SearchParams } from "@/lib/types"

interface SavedSearchesProps {
  /** Current search params to save. */
  currentParams: SearchParams
  /** Apply a recalled search's params. */
  onRecall: (params: SearchParams) => void
}

export function SavedSearches({ currentParams, onRecall }: SavedSearchesProps) {
  const { searches, saveSearch, deleteSearch, isAuthed } = useSavedSearches()
  const [name, setName] = useState("")
  const [saveOpen, setSaveOpen] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const canSave = currentParams.sites.length > 0 && name.trim().length > 0

  async function handleSave() {
    if (!canSave) return
    await saveSearch(name, currentParams)
    setName("")
    setSaveOpen(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      {/* Recall menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Bookmark className="h-3.5 w-3.5" />
            Saved
            {searches.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                {searches.length}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {isAuthed
              ? "Synced to your account"
              : "Saved on this device — sign in to sync"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {searches.length === 0 ? (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">
              No saved searches yet.
            </div>
          ) : (
            searches
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onSelect={(e) => {
                    e.preventDefault()
                    onRecall(s.params)
                  }}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {s.name}
                    <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                      {s.params.sites.join(", ")}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${s.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSearch(s.id)
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save current */}
      <Popover open={saveOpen} onOpenChange={setSaveOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={currentParams.sites.length === 0}
          >
            {justSaved ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" /> Saved
              </>
            ) : (
              <>
                <BookmarkPlus className="h-3.5 w-3.5" /> Save
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-2">
          <p className="text-sm font-medium">Name this search</p>
          <p className="text-xs text-muted-foreground">
            Sites: <span className="font-mono">{currentParams.sites.join(", ") || "none"}</span>
          </p>
          <Input
            autoFocus
            placeholder="e.g. Vancouver IFR"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave()
            }}
          />
          <Button size="sm" className="w-full gap-1.5" disabled={!canSave} onClick={handleSave}>
            <BookmarkPlus className="h-3.5 w-3.5" />
            Save search
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}
