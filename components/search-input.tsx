"use client"

import { useState, useCallback, type KeyboardEvent } from "react"
import { X, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { SearchParams } from "@/lib/types"

interface SearchInputProps {
  onSearch: (params: SearchParams) => void
  isLoading: boolean
}

const DEFAULT_PARAMS: SearchParams = {
  sites: [],
  products: {
    // Text products - default on
    sigmet: true,
    airmet: true,
    notam: true,
    metar: true,
    taf: true,
    pirep: true,
    upperwind: true,
    space_weather: true,
    // BC VFR Route Forecast
    bc_vfr_route: false,
    // Analysis charts
    analysis_250: false,
    analysis_500_thickness: false,
    analysis_500_vorticity: false,
    analysis_700: false,
    analysis_850: false,
    analysis_surface: false,
    // Radar
    radar_national_echotop: false,
    radar_national_cappi_rain: false,
    radar_national_cappi_snow: false,
    radar_regional_echotop: false,
    radar_regional_cappi_rain: false,
    radar_regional_cappi_snow: false,
    radar_individual_echotop: false,
    radar_individual_cappi_rain: false,
    radar_individual_cappi_snow: false,
    // Satellite
    satellite_infrared: false,
    satellite_visible: false,
    satellite_yukon_nwt: false,
    // Graphical Forecast
    gfa_clouds_weather: false,
    gfa_icing_turb_freezing: false,
    gfa_local_bc: false,
    // Significant Weather
    sigwx_high: false,
    sigwx_mid: false,
    sigwx_surface: false,
    // Turbulence
    turb_all: false,
    // Wind levels
    wind_3000: false,
    wind_6000: false,
    wind_9000: false,
    wind_12000: false,
    wind_fl180: false,
    wind_fl240: false,
    wind_fl340: false,
    wind_fl390: false,
    wind_fl450: false,
  },
  notamLanguage: "default",
  metarHours: "0",
  routeRadius: null,
  showDuplicates: false,
}

const METAR_HOURS_OPTIONS = [
  { value: "0", label: "0H (Current Data Only)" },
  { value: "1", label: "1H" },
  { value: "2", label: "2H" },
  { value: "3", label: "3H" },
  { value: "4", label: "4H" },
  { value: "5", label: "5H" },
  { value: "6", label: "6H" },
] as const

const NOTAM_LANGUAGE_OPTIONS = [
  { value: "default", label: "EN+FR" },
  { value: "english", label: "EN" },
  { value: "french", label: "FR" },
] as const

export function SearchInput({ onSearch, isLoading }: SearchInputProps) {
  const [params, setParams] = useState<SearchParams>(DEFAULT_PARAMS)
  const [inputValue, setInputValue] = useState("")
  const [radiusEnabled, setRadiusEnabled] = useState(false)
  const [radiusValue, setRadiusValue] = useState("10")
  const [showGraphicalProducts, setShowGraphicalProducts] = useState(false)

  const addSite = useCallback((site: string) => {
    const trimmed = site.trim().toUpperCase()
    if (trimmed && !params.sites.includes(trimmed)) {
      setParams(prev => ({
        ...prev,
        sites: [...prev.sites, trimmed],
      }))
    }
    setInputValue("")
  }, [params.sites])

  const removeSite = useCallback((site: string) => {
    setParams(prev => ({
      ...prev,
      sites: prev.sites.filter(s => s !== site),
    }))
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault()
      addSite(inputValue)
    }
  }, [inputValue, addSite])

  const handleSearch = useCallback(() => {
    if (params.sites.length === 0) return
    onSearch({
      ...params,
      routeRadius: radiusEnabled ? parseInt(radiusValue) || 10 : null,
    })
  }, [params, radiusEnabled, radiusValue, onSearch])

  const handleRestoreDefaults = useCallback(() => {
    setParams(DEFAULT_PARAMS)
    setInputValue("")
    setRadiusEnabled(false)
    setRadiusValue("10")
  }, [])

  const toggleProduct = useCallback((product: keyof SearchParams["products"]) => {
    setParams(prev => ({
      ...prev,
      products: {
        ...prev.products,
        [product]: !prev.products[product],
      },
    }))
  }, [])

  return (
    <div className="w-full space-y-4">
      {/* Site Input */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-background p-2 min-h-[42px]">
          {params.sites.map(site => (
            <span
              key={site}
              className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-sm font-medium text-secondary-foreground"
            >
              {site}
              <button
                type="button"
                onClick={() => removeSite(site)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Input
            type="text"
            placeholder="Enter Aerodrome, FIR, Navaid, etc."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => inputValue && addSite(inputValue)}
            className="flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 min-w-[200px]"
          />
        </div>
      </div>

      {/* Action Buttons and Options */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          <Button
            onClick={handleSearch}
            disabled={params.sites.length === 0 || isLoading}
          >
            {isLoading ? "Searching..." : "Search"}
          </Button>
          <Button variant="secondary" onClick={handleRestoreDefaults}>
            Restore Defaults
          </Button>
        </div>

        {/* Radius Toggle */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="radius-toggle"
            checked={radiusEnabled}
            onCheckedChange={(checked) => setRadiusEnabled(checked === true)}
          />
          <Label htmlFor="radius-toggle" className="text-sm">
            Route Radius (NM)
          </Label>
          <Input
            type="number"
            placeholder="10"
            value={radiusValue}
            onChange={(e) => setRadiusValue(e.target.value)}
            disabled={!radiusEnabled}
            className="w-20"
            min={1}
            max={999}
          />
        </div>

        {/* Show Duplicates */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="duplicates-toggle"
            checked={params.showDuplicates}
            onCheckedChange={(checked) =>
              setParams(prev => ({ ...prev, showDuplicates: checked === true }))
            }
          />
          <Label htmlFor="duplicates-toggle" className="text-sm">
            Show Duplicates
          </Label>
        </div>
      </div>

      {/* Text Product Toggles */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="sigmet-toggle"
            checked={params.products.sigmet}
            onCheckedChange={() => toggleProduct("sigmet")}
          />
          <Label htmlFor="sigmet-toggle" className="text-sm">SIGMET</Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="airmet-toggle"
            checked={params.products.airmet}
            onCheckedChange={() => toggleProduct("airmet")}
          />
          <Label htmlFor="airmet-toggle" className="text-sm">AIRMET</Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="notam-toggle"
            checked={params.products.notam}
            onCheckedChange={() => toggleProduct("notam")}
          />
          <Label htmlFor="notam-toggle" className="text-sm">NOTAM</Label>
          <Select
            value={params.notamLanguage}
            onValueChange={(value: "default" | "english" | "french") =>
              setParams(prev => ({ ...prev, notamLanguage: value }))
            }
          >
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTAM_LANGUAGE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="metar-toggle"
            checked={params.products.metar}
            onCheckedChange={() => toggleProduct("metar")}
          />
          <Label htmlFor="metar-toggle" className="text-sm">METAR</Label>
          <Select
            value={params.metarHours}
            onValueChange={(value) =>
              setParams(prev => ({ ...prev, metarHours: value }))
            }
          >
            <SelectTrigger className="w-36 h-8">
              <SelectValue placeholder="0H (Current)" />
            </SelectTrigger>
            <SelectContent>
              {METAR_HOURS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="taf-toggle"
            checked={params.products.taf}
            onCheckedChange={() => toggleProduct("taf")}
          />
          <Label htmlFor="taf-toggle" className="text-sm">TAF</Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="pirep-toggle"
            checked={params.products.pirep}
            onCheckedChange={() => toggleProduct("pirep")}
          />
          <Label htmlFor="pirep-toggle" className="text-sm">PIREP</Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="upperwind-toggle"
            checked={params.products.upperwind}
            onCheckedChange={() => toggleProduct("upperwind")}
          />
          <Label htmlFor="upperwind-toggle" className="text-sm">Upper Wind</Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="space-weather-toggle"
            checked={params.products.space_weather}
            onCheckedChange={() => toggleProduct("space_weather")}
          />
          <Label htmlFor="space-weather-toggle" className="text-sm">Space Weather</Label>
        </div>
      </div>

      {/* Graphical Products Collapsible */}
      <Collapsible open={showGraphicalProducts} onOpenChange={setShowGraphicalProducts}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            Graphical Products
            {showGraphicalProducts ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {/* BC VFR Route Forecast */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="bc-vfr-route-toggle"
              checked={params.products.bc_vfr_route}
              onCheckedChange={() => toggleProduct("bc_vfr_route")}
            />
            <Label htmlFor="bc-vfr-route-toggle" className="text-sm">BC VFR Route Forecast</Label>
          </div>

          {/* Analysis Charts */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Analysis</h4>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="analysis-250-toggle"
                  checked={params.products.analysis_250}
                  onCheckedChange={() => toggleProduct("analysis_250")}
                />
                <Label htmlFor="analysis-250-toggle" className="text-sm">250 hPa</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="analysis-500-thickness-toggle"
                  checked={params.products.analysis_500_thickness}
                  onCheckedChange={() => toggleProduct("analysis_500_thickness")}
                />
                <Label htmlFor="analysis-500-thickness-toggle" className="text-sm">500 hPa Thickness</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="analysis-500-vorticity-toggle"
                  checked={params.products.analysis_500_vorticity}
                  onCheckedChange={() => toggleProduct("analysis_500_vorticity")}
                />
                <Label htmlFor="analysis-500-vorticity-toggle" className="text-sm">500 hPa Vorticity</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="analysis-700-toggle"
                  checked={params.products.analysis_700}
                  onCheckedChange={() => toggleProduct("analysis_700")}
                />
                <Label htmlFor="analysis-700-toggle" className="text-sm">700 hPa</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="analysis-850-toggle"
                  checked={params.products.analysis_850}
                  onCheckedChange={() => toggleProduct("analysis_850")}
                />
                <Label htmlFor="analysis-850-toggle" className="text-sm">850 hPa</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="analysis-surface-toggle"
                  checked={params.products.analysis_surface}
                  onCheckedChange={() => toggleProduct("analysis_surface")}
                />
                <Label htmlFor="analysis-surface-toggle" className="text-sm">Surface</Label>
              </div>
            </div>
          </div>

          {/* Radar */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Radar</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* National */}
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground">National</h5>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="radar-national-echotop-toggle"
                      checked={params.products.radar_national_echotop}
                      onCheckedChange={() => toggleProduct("radar_national_echotop")}
                    />
                    <Label htmlFor="radar-national-echotop-toggle" className="text-sm">ECHOTOP</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="radar-national-cappi-rain-toggle"
                      checked={params.products.radar_national_cappi_rain}
                      onCheckedChange={() => toggleProduct("radar_national_cappi_rain")}
                    />
                    <Label htmlFor="radar-national-cappi-rain-toggle" className="text-sm">CAPPI (RAIN)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="radar-national-cappi-snow-toggle"
                      checked={params.products.radar_national_cappi_snow}
                      onCheckedChange={() => toggleProduct("radar_national_cappi_snow")}
                    />
                    <Label htmlFor="radar-national-cappi-snow-toggle" className="text-sm">CAPPI (SNOW)</Label>
                  </div>
                </div>
              </div>

              {/* Regional */}
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground">Regional</h5>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="radar-regional-echotop-toggle"
                      checked={params.products.radar_regional_echotop}
                      onCheckedChange={() => toggleProduct("radar_regional_echotop")}
                    />
                    <Label htmlFor="radar-regional-echotop-toggle" className="text-sm">ECHOTOP</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="radar-regional-cappi-rain-toggle"
                      checked={params.products.radar_regional_cappi_rain}
                      onCheckedChange={() => toggleProduct("radar_regional_cappi_rain")}
                    />
                    <Label htmlFor="radar-regional-cappi-rain-toggle" className="text-sm">CAPPI (RAIN)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="radar-regional-cappi-snow-toggle"
                      checked={params.products.radar_regional_cappi_snow}
                      onCheckedChange={() => toggleProduct("radar_regional_cappi_snow")}
                    />
                    <Label htmlFor="radar-regional-cappi-snow-toggle" className="text-sm">CAPPI (SNOW)</Label>
                  </div>
                </div>
              </div>

              {/* Individual */}
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground">Individual</h5>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="radar-individual-echotop-toggle"
                      checked={params.products.radar_individual_echotop}
                      onCheckedChange={() => toggleProduct("radar_individual_echotop")}
                    />
                    <Label htmlFor="radar-individual-echotop-toggle" className="text-sm">ECHOTOP</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="radar-individual-cappi-rain-toggle"
                      checked={params.products.radar_individual_cappi_rain}
                      onCheckedChange={() => toggleProduct("radar_individual_cappi_rain")}
                    />
                    <Label htmlFor="radar-individual-cappi-rain-toggle" className="text-sm">CAPPI (RAIN)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="radar-individual-cappi-snow-toggle"
                      checked={params.products.radar_individual_cappi_snow}
                      onCheckedChange={() => toggleProduct("radar_individual_cappi_snow")}
                    />
                    <Label htmlFor="radar-individual-cappi-snow-toggle" className="text-sm">CAPPI (SNOW)</Label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Satellite */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Satellite</h4>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="satellite-infrared-toggle"
                  checked={params.products.satellite_infrared}
                  onCheckedChange={() => toggleProduct("satellite_infrared")}
                />
                <Label htmlFor="satellite-infrared-toggle" className="text-sm">Infrared</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="satellite-visible-toggle"
                  checked={params.products.satellite_visible}
                  onCheckedChange={() => toggleProduct("satellite_visible")}
                />
                <Label htmlFor="satellite-visible-toggle" className="text-sm">Visible</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="satellite-yukon-nwt-toggle"
                  checked={params.products.satellite_yukon_nwt}
                  onCheckedChange={() => toggleProduct("satellite_yukon_nwt")}
                />
                <Label htmlFor="satellite-yukon-nwt-toggle" className="text-sm">Yukon and NWT 3u</Label>
              </div>
            </div>
          </div>

          {/* Graphical Forecast */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Graphical Forecast</h4>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="gfa-clouds-weather-toggle"
                  checked={params.products.gfa_clouds_weather}
                  onCheckedChange={() => toggleProduct("gfa_clouds_weather")}
                />
                <Label htmlFor="gfa-clouds-weather-toggle" className="text-sm">Clouds & Weather</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="gfa-icing-turb-freezing-toggle"
                  checked={params.products.gfa_icing_turb_freezing}
                  onCheckedChange={() => toggleProduct("gfa_icing_turb_freezing")}
                />
                <Label htmlFor="gfa-icing-turb-freezing-toggle" className="text-sm">Icing, Turbulence & Freezing level</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="gfa-local-bc-toggle"
                  checked={params.products.gfa_local_bc}
                  onCheckedChange={() => toggleProduct("gfa_local_bc")}
                />
                <Label htmlFor="gfa-local-bc-toggle" className="text-sm">Local (BC)</Label>
              </div>
            </div>
          </div>

          {/* Significant Weather */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Significant Weather</h4>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sigwx-high-toggle"
                  checked={params.products.sigwx_high}
                  onCheckedChange={() => toggleProduct("sigwx_high")}
                />
                <Label htmlFor="sigwx-high-toggle" className="text-sm">High Level</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sigwx-mid-toggle"
                  checked={params.products.sigwx_mid}
                  onCheckedChange={() => toggleProduct("sigwx_mid")}
                />
                <Label htmlFor="sigwx-mid-toggle" className="text-sm">Mid Level</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sigwx-surface-toggle"
                  checked={params.products.sigwx_surface}
                  onCheckedChange={() => toggleProduct("sigwx_surface")}
                />
                <Label htmlFor="sigwx-surface-toggle" className="text-sm">Surface Depiction</Label>
              </div>
            </div>
          </div>

          {/* Turbulence */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Turbulence</h4>
            <div className="flex items-center gap-2">
              <Checkbox
                id="turb-all-toggle"
                checked={params.products.turb_all}
                onCheckedChange={() => toggleProduct("turb_all")}
              />
              <Label htmlFor="turb-all-toggle" className="text-sm">All</Label>
            </div>
          </div>

          {/* Wind */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Wind</h4>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wind-3000-toggle"
                  checked={params.products.wind_3000}
                  onCheckedChange={() => toggleProduct("wind_3000")}
                />
                <Label htmlFor="wind-3000-toggle" className="text-sm">3000</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wind-6000-toggle"
                  checked={params.products.wind_6000}
                  onCheckedChange={() => toggleProduct("wind_6000")}
                />
                <Label htmlFor="wind-6000-toggle" className="text-sm">6000</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wind-9000-toggle"
                  checked={params.products.wind_9000}
                  onCheckedChange={() => toggleProduct("wind_9000")}
                />
                <Label htmlFor="wind-9000-toggle" className="text-sm">9000</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wind-12000-toggle"
                  checked={params.products.wind_12000}
                  onCheckedChange={() => toggleProduct("wind_12000")}
                />
                <Label htmlFor="wind-12000-toggle" className="text-sm">12000</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wind-fl180-toggle"
                  checked={params.products.wind_fl180}
                  onCheckedChange={() => toggleProduct("wind_fl180")}
                />
                <Label htmlFor="wind-fl180-toggle" className="text-sm">FL180</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wind-fl240-toggle"
                  checked={params.products.wind_fl240}
                  onCheckedChange={() => toggleProduct("wind_fl240")}
                />
                <Label htmlFor="wind-fl240-toggle" className="text-sm">FL240</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wind-fl340-toggle"
                  checked={params.products.wind_fl340}
                  onCheckedChange={() => toggleProduct("wind_fl340")}
                />
                <Label htmlFor="wind-fl340-toggle" className="text-sm">FL340</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wind-fl390-toggle"
                  checked={params.products.wind_fl390}
                  onCheckedChange={() => toggleProduct("wind_fl390")}
                />
                <Label htmlFor="wind-fl390-toggle" className="text-sm">FL390</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wind-fl450-toggle"
                  checked={params.products.wind_fl450}
                  onCheckedChange={() => toggleProduct("wind_fl450")}
                />
                <Label htmlFor="wind-fl450-toggle" className="text-sm">FL450</Label>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
