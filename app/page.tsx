"use client"

import { useState, useCallback } from "react"
import { SearchInput } from "@/components/search-input"
import { ResultsDisplay } from "@/components/results-display"
import { ThemeToggle } from "@/components/theme-toggle"
import { useDismissedNotams } from "@/hooks/use-dismissed-notams"
import type { SearchParams, WeatherResponse } from "@/lib/types"

export default function Home() {
  const [data, setData] = useState<WeatherResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    dismissedIds,
    dismiss,
    restore,
    restoreAll,
    isDismissed,
  } = useDismissedNotams()

  const handleSearch = useCallback(async (params: SearchParams) => {
    setIsLoading(true)
    setError(null)

    try {
      // Build query string
      const queryParams = new URLSearchParams()

      // Add sites
      params.sites.forEach(site => {
        queryParams.append("site", site)
      })

      // Add products
      if (params.products.sigmet) queryParams.append("alpha", "sigmet")
      if (params.products.airmet) queryParams.append("alpha", "airmet")
      if (params.products.notam) queryParams.append("alpha", "notam")
      if (params.products.metar) queryParams.append("alpha", "metar")
      if (params.products.taf) queryParams.append("alpha", "taf")
      if (params.products.pirep) queryParams.append("alpha", "pirep")
      if (params.products.upperwind) queryParams.append("alpha", "upperwind")
      if (params.products.space_weather) queryParams.append("alpha", "space_weather")

      // Add NOTAM language
      if (params.products.notam) {
        queryParams.set("notam_choice", params.notamLanguage)
      }

      // Add METAR hours (only if not "0" which means use current data only)
      if (params.products.metar && params.metarHours && params.metarHours !== "0") {
        queryParams.set("metar_choice", params.metarHours)
      }

      // Add radius if specified
      if (params.routeRadius) {
        queryParams.set("radius", params.routeRadius.toString())
      }

      // Add show duplicates
      if (!params.showDuplicates) {
        queryParams.set("collapse_duplicates", "true")
      }

      const response = await fetch(`/api/weather?${queryParams.toString()}`)

      if (!response.ok) {
        throw new Error("Failed to fetch weather data")
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">NewNotams.Net</h1>
            <p className="text-sm text-muted-foreground">
              Aviation Weather and NOTAMs with Smart Filtering
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Search Input */}
        <section className="rounded-lg border border-border bg-card p-4">
          <SearchInput onSearch={handleSearch} isLoading={isLoading} />
        </section>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}

        {/* Results */}
        <section>
          <ResultsDisplay
            data={data}
            dismissedIds={dismissedIds}
            onDismiss={dismiss}
            onRestore={restore}
            onRestoreAll={restoreAll}
            isDismissed={isDismissed}
          />
        </section>
      </div>

      <footer className="border-t border-border mt-12">
        <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
          <p>
            Data sourced from{" "}
            <a
              href="https://plan.navcanada.ca/wxrecall/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Nav Canada CFPS
            </a>
          </p>
        </div>
      </footer>
    </main>
  )
}
