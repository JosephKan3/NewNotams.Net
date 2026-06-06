import type { SearchParams } from "@/lib/types"

export interface SavedSearch {
  id: string
  name: string
  params: SearchParams
  createdAt: number
}

export function makeSearchId(): string {
  return crypto.randomUUID()
}
