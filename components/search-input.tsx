"use client"

import { useState, useCallback, type KeyboardEvent } from "react"
import { X } from "lucide-react"
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
import type { SearchParams } from "@/lib/types"

interface SearchInputProps {
  onSearch: (params: SearchParams) => void
  isLoading: boolean
}

const DEFAULT_PARAMS: SearchParams = {
  sites: [],
  products: {
    sigmet: true,
    airmet: true,
    notam: true,
    metar: true,
    taf: true,
    pirep: true,
    upperwind: true,
    space_weather: true,
  },
  notamLanguage: "default",
  metarHours: "0",
  routeRadius: null,
  showDuplicates: false,
}

export function SearchInput({ onSearch, isLoading }: SearchInputProps) {
  const [params, setParams] = useState<SearchParams>(DEFAULT_PARAMS)
  const [inputValue, setInputValue] = useState("")
  const [radiusEnabled, setRadiusEnabled] = useState(false)
  const [radiusValue, setRadiusValue] = useState("10")

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

      {/* Product Toggles */}
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
              <SelectItem value="default">EN+FR</SelectItem>
              <SelectItem value="english">EN</SelectItem>
              <SelectItem value="french">FR</SelectItem>
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
              <SelectItem value="0">0H (Current Data Only)</SelectItem>
              <SelectItem value="1">1H</SelectItem>
              <SelectItem value="2">2H</SelectItem>
              <SelectItem value="3">3H</SelectItem>
              <SelectItem value="4">4H</SelectItem>
              <SelectItem value="5">5H</SelectItem>
              <SelectItem value="6">6H</SelectItem>
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
    </div>
  )
}
