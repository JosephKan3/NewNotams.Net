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

      // Add text products
      if (params.products.sigmet) queryParams.append("alpha", "sigmet")
      if (params.products.airmet) queryParams.append("alpha", "airmet")
      if (params.products.notam) queryParams.append("alpha", "notam")
      if (params.products.metar) queryParams.append("alpha", "metar")
      if (params.products.taf) queryParams.append("alpha", "taf")
      if (params.products.pirep) queryParams.append("alpha", "pirep")
      if (params.products.upperwind) queryParams.append("alpha", "upperwind")
      if (params.products.space_weather) queryParams.append("alpha", "space_weather")

      // BC VFR Route Forecast
      if (params.products.bc_vfr_route) queryParams.append("alpha", "bc_vfr_route")

      // Analysis charts
      if (params.products.analysis_250) queryParams.append("alpha", "analysis_250")
      if (params.products.analysis_500_thickness) queryParams.append("alpha", "analysis_500_thickness")
      if (params.products.analysis_500_vorticity) queryParams.append("alpha", "analysis_500_vorticity")
      if (params.products.analysis_700) queryParams.append("alpha", "analysis_700")
      if (params.products.analysis_850) queryParams.append("alpha", "analysis_850")
      if (params.products.analysis_surface) queryParams.append("alpha", "analysis_surface")

      // Radar - National
      if (params.products.radar_national_echotop) queryParams.append("alpha", "radar_national_echotop")
      if (params.products.radar_national_cappi_rain) queryParams.append("alpha", "radar_national_cappi_rain")
      if (params.products.radar_national_cappi_snow) queryParams.append("alpha", "radar_national_cappi_snow")
      // Radar - Regional
      if (params.products.radar_regional_echotop) queryParams.append("alpha", "radar_regional_echotop")
      if (params.products.radar_regional_cappi_rain) queryParams.append("alpha", "radar_regional_cappi_rain")
      if (params.products.radar_regional_cappi_snow) queryParams.append("alpha", "radar_regional_cappi_snow")
      // Radar - Individual
      if (params.products.radar_individual_echotop) queryParams.append("alpha", "radar_individual_echotop")
      if (params.products.radar_individual_cappi_rain) queryParams.append("alpha", "radar_individual_cappi_rain")
      if (params.products.radar_individual_cappi_snow) queryParams.append("alpha", "radar_individual_cappi_snow")

      // Satellite
      if (params.products.satellite_infrared) queryParams.append("alpha", "satellite_infrared")
      if (params.products.satellite_visible) queryParams.append("alpha", "satellite_visible")
      if (params.products.satellite_yukon_nwt) queryParams.append("alpha", "satellite_yukon_nwt")

      // Graphical Forecast
      if (params.products.gfa_clouds_weather) queryParams.append("alpha", "gfa_clouds_weather")
      if (params.products.gfa_icing_turb_freezing) queryParams.append("alpha", "gfa_icing_turb_freezing")
      if (params.products.gfa_local_bc) queryParams.append("alpha", "gfa_local_bc")

      // Significant Weather
      if (params.products.sigwx_high) queryParams.append("alpha", "sigwx_high")
      if (params.products.sigwx_mid) queryParams.append("alpha", "sigwx_mid")
      if (params.products.sigwx_surface) queryParams.append("alpha", "sigwx_surface")

      // Turbulence
      if (params.products.turb_all) queryParams.append("alpha", "turb_all")

      // Wind levels
      if (params.products.wind_3000) queryParams.append("alpha", "wind_3000")
      if (params.products.wind_6000) queryParams.append("alpha", "wind_6000")
      if (params.products.wind_9000) queryParams.append("alpha", "wind_9000")
      if (params.products.wind_12000) queryParams.append("alpha", "wind_12000")
      if (params.products.wind_fl180) queryParams.append("alpha", "wind_fl180")
      if (params.products.wind_fl240) queryParams.append("alpha", "wind_fl240")
      if (params.products.wind_fl340) queryParams.append("alpha", "wind_fl340")
      if (params.products.wind_fl390) queryParams.append("alpha", "wind_fl390")
      if (params.products.wind_fl450) queryParams.append("alpha", "wind_fl450")

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
