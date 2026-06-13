"use client";

import { useState, useCallback } from "react";
import { Github } from "lucide-react";
import { SearchInput } from "@/components/search-input";
import { ResultsDisplay } from "@/components/results-display";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotifySettings } from "@/components/notify-settings";
import { UserMenu } from "@/components/user-menu";
import { useDismissedNotams } from "@/hooks/use-dismissed-notams";
import { UtcClock } from "@/components/utc-clock";
import type { SearchParams, WeatherResponse } from "@/lib/types";

export default function Home() {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQueryString, setLastQueryString] = useState<string | undefined>(
    undefined,
  );

  const {
    dismissedIds,
    dismissedNotams,
    dismiss,
    restore,
    restoreAll,
    isDismissed,
  } = useDismissedNotams();

  const handleSearch = useCallback(async (params: SearchParams) => {
    setIsLoading(true);
    setError(null);

    try {
      // Build query string
      const queryParams = new URLSearchParams();

      // Add sites
      params.sites.forEach((site) => {
        queryParams.append("site", site);
      });

      // Add text products (alpha)
      if (params.products.sigmet) queryParams.append("alpha", "sigmet");
      if (params.products.airmet) queryParams.append("alpha", "airmet");
      if (params.products.notam) queryParams.append("alpha", "notam");
      if (params.products.metar) queryParams.append("alpha", "metar");
      if (params.products.taf) queryParams.append("alpha", "taf");
      if (params.products.pirep) queryParams.append("alpha", "pirep");
      if (params.products.upperwind) queryParams.append("alpha", "upperwind");
      if (params.products.space_weather)
        queryParams.append("alpha", "space_weather");
      if (params.products.bc_vfr_route)
        queryParams.append("alpha", "vfr_route");

      // Add image products
      // Upper Analysis
      if (params.products.analysis_250)
        queryParams.append("image", "UPPER_ANALYSIS//250HPA");
      if (params.products.analysis_500_thickness)
        queryParams.append("image", "UPPER_ANALYSIS//500HPA/THKNS");
      if (params.products.analysis_500_vorticity)
        queryParams.append("image", "UPPER_ANALYSIS//500HPA/VORT");
      if (params.products.analysis_700)
        queryParams.append("image", "UPPER_ANALYSIS//700HPA");
      if (params.products.analysis_850)
        queryParams.append("image", "UPPER_ANALYSIS//850HPA");
      if (params.products.analysis_surface)
        queryParams.append("image", "SURFACE_ANALYSIS");

      // Radar - National
      if (params.products.radar_national_echotop)
        queryParams.append("image", "COMPOSITE_RADAR/ECHOTOP/NAT");
      if (params.products.radar_national_cappi_rain)
        queryParams.append("image", "COMPOSITE_RADAR/LOW_RAIN~CAPPI/NAT");
      if (params.products.radar_national_cappi_snow)
        queryParams.append("image", "COMPOSITE_RADAR/LOW_SNOW~CAPPI/NAT");

      // Radar - Regional (all regions)
      if (params.products.radar_regional_echotop) {
        queryParams.append("image", "COMPOSITE_RADAR/ECHOTOP/PAC");
        queryParams.append("image", "COMPOSITE_RADAR/ECHOTOP/WRN");
        queryParams.append("image", "COMPOSITE_RADAR/ECHOTOP/ONT");
        queryParams.append("image", "COMPOSITE_RADAR/ECHOTOP/QUE");
        queryParams.append("image", "COMPOSITE_RADAR/ECHOTOP/ERN");
      }
      if (params.products.radar_regional_cappi_rain) {
        queryParams.append("image", "COMPOSITE_RADAR/LOW_RAIN~CAPPI/PAC");
        queryParams.append("image", "COMPOSITE_RADAR/LOW_RAIN~CAPPI/WRN");
        queryParams.append("image", "COMPOSITE_RADAR/LOW_RAIN~CAPPI/ONT");
        queryParams.append("image", "COMPOSITE_RADAR/LOW_RAIN~CAPPI/QUE");
        queryParams.append("image", "COMPOSITE_RADAR/LOW_RAIN~CAPPI/ERN");
      }
      if (params.products.radar_regional_cappi_snow) {
        queryParams.append("image", "COMPOSITE_RADAR/LOW_SNOW~CAPPI/PAC");
        queryParams.append("image", "COMPOSITE_RADAR/LOW_SNOW~CAPPI/WRN");
        queryParams.append("image", "COMPOSITE_RADAR/LOW_SNOW~CAPPI/ONT");
        queryParams.append("image", "COMPOSITE_RADAR/LOW_SNOW~CAPPI/QUE");
        queryParams.append("image", "COMPOSITE_RADAR/LOW_SNOW~CAPPI/ERN");
      }

      // Radar - Individual
      if (params.products.radar_individual_echotop)
        queryParams.append("image", "RADAR/ECHOTOP");
      if (params.products.radar_individual_cappi_rain)
        queryParams.append("image", "RADAR/CAPPI_RAIN");
      if (params.products.radar_individual_cappi_snow)
        queryParams.append("image", "RADAR/CAPPI_SNOW");

      // Satellite
      if (params.products.satellite_infrared)
        queryParams.append("image", "SATELLITE/IR");
      if (params.products.satellite_visible)
        queryParams.append("image", "SATELLITE/VIS");
      if (params.products.satellite_yukon_nwt)
        queryParams.append("image", "SATELLITE/3u/*/*");

      // Graphical Forecast (GFA)
      if (params.products.gfa_clouds_weather)
        queryParams.append("image", "GFA/CLDWX");
      if (params.products.gfa_icing_turb_freezing)
        queryParams.append("image", "GFA/TURBC");
      if (params.products.gfa_local_bc) queryParams.append("image", "LGF");

      // Significant Weather
      if (params.products.sigwx_high)
        queryParams.append("image", "SIG_WX//HIGH_LEVEL/*");
      if (params.products.sigwx_mid)
        queryParams.append("image", "SIG_WX//MID_LEVEL/*");
      if (params.products.sigwx_surface)
        queryParams.append("image", "SIG_WX/DEPICTION/SURFACE/*");

      // Turbulence
      if (params.products.turb_all) queryParams.append("image", "TURBULENCE");

      // Low Level Wind
      if (params.products.wind_3000)
        queryParams.append("image", "LOW_LEVEL_WIND/FL030");
      if (params.products.wind_6000)
        queryParams.append("image", "LOW_LEVEL_WIND/FL060");
      if (params.products.wind_9000)
        queryParams.append("image", "LOW_LEVEL_WIND/FL090");
      if (params.products.wind_12000)
        queryParams.append("image", "LOW_LEVEL_WIND/FL120");
      if (params.products.wind_fl180)
        queryParams.append("image", "LOW_LEVEL_WIND/FL180");

      // High Level Wind
      if (params.products.wind_fl240)
        queryParams.append("image", "HIGH_LEVEL_WIND/FL_240");
      if (params.products.wind_fl340)
        queryParams.append("image", "HIGH_LEVEL_WIND/FL_340");
      if (params.products.wind_fl390)
        queryParams.append("image", "HIGH_LEVEL_WIND/FL390");
      if (params.products.wind_fl450)
        queryParams.append("image", "HIGH_LEVEL_WIND/FL450");

      // Add NOTAM language
      if (params.products.notam) {
        queryParams.set("notam_choice", params.notamLanguage);
      }

      // Add METAR hours (only if not "0" which means use current data only)
      if (
        params.products.metar &&
        params.metarHours &&
        params.metarHours !== "0"
      ) {
        queryParams.set("metar_choice", params.metarHours);
      }

      // Add radius if specified
      if (params.routeRadius) {
        queryParams.set("radius", params.routeRadius.toString());
      }

      // Add show duplicates
      if (!params.showDuplicates) {
        queryParams.set("collapse_duplicates", "true");
      }

      setLastQueryString(queryParams.toString());
      const response = await fetch(`/api/weather?${queryParams.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch weather data");
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-1.5 flex items-center justify-between gap-4">
          <div className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/NNN_Banner.png"
              alt="NewNotams.Net"
              className="h-14 w-auto object-contain sm:h-16 md:h-20"
            />
          </div>
          <div className="flex items-center gap-3">
            <UtcClock className="font-mono text-sm tabular-nums text-muted-foreground" />
            <NotifySettings
              currentQueryString={lastQueryString}
              dismissedIds={dismissedIds}
            />
            <ThemeToggle />
            <UserMenu />
          </div>
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
            dismissedNotams={dismissedNotams}
            onDismiss={dismiss}
            onRestore={restore}
            onRestoreAll={restoreAll}
            isDismissed={isDismissed}
          />
        </section>
      </div>

      <footer className="border-t border-border mt-12">
        <div className="container mx-auto px-4 py-4 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
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
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
            <a
              href="https://github.com/JosephKan3/NewNotams.Net"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 underline hover:text-foreground"
            >
              <Github className="h-4 w-4" aria-hidden="true" />
              GitHub
            </a>
            <span aria-hidden="true">·</span>
            <span>
              Found a bug or have a feature request?{" "}
              <a
                href="https://github.com/JosephKan3/NewNotams.Net/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Open an issue
              </a>
            </span>
          </p>
        </div>
      </footer>
    </main>
  );
}
