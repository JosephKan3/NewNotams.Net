"use client"

import { useMemo, useState } from "react"
import { Eye, EyeOff, RotateCcw, X, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { WeatherData, WeatherResponse } from "@/lib/types"
import { parseNotamText, parseNotamId, PRODUCT_LABELS, TEXT_PRODUCT_TYPES } from "@/lib/types"

interface ResultsDisplayProps {
  data: WeatherResponse | null
  dismissedIds: string[]
  onDismiss: (id: string) => void
  onRestore: (id: string) => void
  onRestoreAll: () => void
  isDismissed: (id: string) => boolean
}

// Order for displaying products
const PRODUCT_ORDER = [
  // Text products first
  "sigmet",
  "airmet",
  "notam",
  "metar",
  "taf",
  "pirep",
  "upperwind",
  "space_weather",
  "vfr_route",
  // Then image products
  "upper_analysis",
  "surface_analysis",
  "composite_radar",
  "radar",
  "satellite",
  "gfa",
  "lgf",
  "sig_wx",
  "turbulence",
  "low_level_wind",
  "high_level_wind",
]

function NotamCard({
  item,
  onDismiss,
  isDismissed,
}: {
  item: WeatherData
  onDismiss: (id: string) => void
  isDismissed: boolean
}) {
  const parsed = parseNotamText(item.text)
  const notamId = parsed?.id || parseNotamId(item.text) || item.pk

  if (isDismissed) return null

  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {item.location}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs">
              {notamId}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onDismiss(notamId)}
            title="Dismiss this NOTAM"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap font-mono text-sm text-muted-foreground leading-relaxed">
          {parsed?.raw || item.text}
        </pre>
      </CardContent>
    </Card>
  )
}

function WeatherCard({ item }: { item: WeatherData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {item.location}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap font-mono text-sm text-muted-foreground leading-relaxed">
          {item.text}
        </pre>
      </CardContent>
    </Card>
  )
}

function ImageCard({ item }: { item: WeatherData }) {
  // The API returns a pk/code that maps to an image URL
  // Format: https://plan.navcanada.ca/weather/images/{code}.image
  const imageCode = item.pk || item.text
  const fullImageUrl = `https://plan.navcanada.ca/weather/images/${imageCode}.image`

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {item.location || item.type}
            </Badge>
            {item.startValidity && (
              <span className="text-xs text-muted-foreground">
                Valid: {new Date(item.startValidity).toLocaleString()}
              </span>
            )}
          </div>
          <a
            href={fullImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative overflow-hidden rounded-md bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullImageUrl}
            alt={`${item.type} - ${item.location || "Weather Chart"}`}
            className="w-full h-auto"
            loading="lazy"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function DismissedNotamsSection({
  dismissedNotams,
  onRestore,
  onRestoreAll,
}: {
  dismissedNotams: { id: string; location: string; text: string }[]
  onRestore: (id: string) => void
  onRestoreAll: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (dismissedNotams.length === 0) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto hover:bg-transparent">
            {isOpen ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span className="font-medium">
              {dismissedNotams.length} Dismissed NOTAM{dismissedNotams.length !== 1 ? "s" : ""}
            </span>
          </Button>
        </CollapsibleTrigger>
        <Button variant="outline" size="sm" onClick={onRestoreAll} className="flex items-center gap-1">
          <RotateCcw className="h-3 w-3" />
          Restore All
        </Button>
      </div>
      <CollapsibleContent className="mt-3 space-y-3">
        {dismissedNotams.map((notam) => (
          <Card key={notam.id} className="opacity-60">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {notam.location}
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {notam.id}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRestore(notam.id)}
                  className="flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap font-mono text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {notam.text}
              </pre>
            </CardContent>
          </Card>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

// Helper to determine if a product type is an image type
function isImageType(type: string): boolean {
  const imageTypes = [
    "upper_analysis",
    "surface_analysis",
    "composite_radar",
    "radar",
    "satellite",
    "gfa",
    "lgf",
    "sig_wx",
    "turbulence",
    "low_level_wind",
    "high_level_wind",
  ]
  const lowerType = type.toLowerCase().replace(/-/g, "_")
  return imageTypes.some(t => lowerType.includes(t) || lowerType === t)
}

// Helper to normalize product type for grouping
function normalizeProductType(type: string): string {
  const lowerType = type.toLowerCase()
  
  // Map various API response types to our display categories
  if (lowerType.includes("upper_analysis") || lowerType.includes("upperanalysis")) return "upper_analysis"
  if (lowerType.includes("surface_analysis") || lowerType.includes("surfaceanalysis")) return "surface_analysis"
  if (lowerType.includes("composite_radar") || lowerType.includes("compositeradar")) return "composite_radar"
  if (lowerType === "radar" || lowerType.startsWith("radar/")) return "radar"
  if (lowerType.includes("satellite")) return "satellite"
  if (lowerType === "gfa" || lowerType.startsWith("gfa/")) return "gfa"
  if (lowerType === "lgf" || lowerType.startsWith("lgf/")) return "lgf"
  if (lowerType.includes("sig_wx") || lowerType.includes("sigwx")) return "sig_wx"
  if (lowerType.includes("turbulence")) return "turbulence"
  if (lowerType.includes("low_level_wind") || lowerType.includes("lowlevelwind")) return "low_level_wind"
  if (lowerType.includes("high_level_wind") || lowerType.includes("highlevelwind")) return "high_level_wind"
  
  return type
}

export function ResultsDisplay({
  data,
  dismissedIds,
  onDismiss,
  onRestore,
  onRestoreAll,
  isDismissed,
}: ResultsDisplayProps) {
  // Group data by product type
  const grouped = useMemo(() => {
    if (!data?.data) return {}
    
    const groups: Record<string, WeatherData[]> = {}
    
    for (const item of data.data) {
      const normalizedType = normalizeProductType(item.type)
      if (!groups[normalizedType]) {
        groups[normalizedType] = []
      }
      groups[normalizedType].push(item)
    }
    
    return groups
  }, [data])

  // Get dismissed NOTAMs that were in the current results
  const dismissedNotams = useMemo(() => {
    if (!data?.data) return []
    
    const notams = data.data.filter(item => item.type === "notam")
    return notams
      .map(item => {
        const parsed = parseNotamText(item.text)
        const id = parsed?.id || parseNotamId(item.text) || item.pk
        return {
          id,
          location: item.location,
          text: parsed?.raw || item.text,
        }
      })
      .filter(notam => dismissedIds.includes(notam.id))
  }, [data, dismissedIds])

  // Count visible NOTAMs
  const visibleNotamCount = useMemo(() => {
    const notams = grouped.notam || []
    return notams.filter(item => {
      const parsed = parseNotamText(item.text)
      const id = parsed?.id || parseNotamId(item.text) || item.pk
      return !isDismissed(id)
    }).length
  }, [grouped.notam, isDismissed])

  if (!data) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Enter aerodrome codes above and click Search to retrieve weather data.
      </div>
    )
  }

  if (data.data.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        No results found for the specified criteria.
      </div>
    )
  }

  // Get all product types that have data, sorted by PRODUCT_ORDER
  const productTypes = Object.keys(grouped).sort((a, b) => {
    const aIndex = PRODUCT_ORDER.indexOf(a)
    const bIndex = PRODUCT_ORDER.indexOf(b)
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <span>Results:</span>
        {Object.entries(data.meta.count).map(([type, count]) => {
          const normalizedType = normalizeProductType(type)
          const label = PRODUCT_LABELS[normalizedType] || PRODUCT_LABELS[type] || type
          return (
            <Badge key={type} variant="outline">
              {label}: {type === "notam" ? visibleNotamCount : count}
              {type === "notam" && dismissedNotams.length > 0 && (
                <span className="ml-1 opacity-60">({dismissedNotams.length} hidden)</span>
              )}
            </Badge>
          )
        })}
      </div>

      {/* Dismissed NOTAMs Section */}
      <DismissedNotamsSection
        dismissedNotams={dismissedNotams}
        onRestore={onRestore}
        onRestoreAll={onRestoreAll}
      />

      {/* Results by Product Type */}
      {productTypes.map(type => {
        const items = grouped[type]
        if (!items || items.length === 0) return null

        const label = PRODUCT_LABELS[type] || type
        const isImage = isImageType(type)

        return (
          <section key={type} className="space-y-3">
            <h2 className="text-lg font-semibold border-b border-border pb-2">
              {label}
              {type === "notam" && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({visibleNotamCount} visible)
                </span>
              )}
            </h2>
            <div className={isImage ? "grid gap-4 md:grid-cols-2" : "grid gap-3"}>
              {items.map((item, index) => {
                if (type === "notam") {
                  const parsed = parseNotamText(item.text)
                  const id = parsed?.id || parseNotamId(item.text) || item.pk
                  return (
                    <NotamCard
                      key={`${item.pk}-${index}`}
                      item={item}
                      onDismiss={onDismiss}
                      isDismissed={isDismissed(id)}
                    />
                  )
                }
                
                if (isImage) {
                  return <ImageCard key={`${item.pk}-${index}`} item={item} />
                }
                
                return <WeatherCard key={`${item.pk}-${index}`} item={item} />
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
