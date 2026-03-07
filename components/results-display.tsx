"use client"

import { useMemo, useState } from "react"
import { Eye, EyeOff, RotateCcw, X, ExternalLink, ChevronLeft, ChevronRight, Play, Pause, ZoomIn, ZoomOut } from "lucide-react"
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

// Format validity time for display (e.g., "07 0000" from timestamp)
function formatValidityTime(timestamp: string | number | undefined): string {
  if (!timestamp) return ""
  const date = new Date(timestamp)
  const day = date.getUTCDate().toString().padStart(2, "0")
  const hours = date.getUTCHours().toString().padStart(2, "0")
  const minutes = date.getUTCMinutes().toString().padStart(2, "0")
  return `${day} ${hours}${minutes}`
}

// Image Panel with frame navigation - similar to Nav Canada's UI
function ImagePanel({ items, title }: { items: WeatherData[]; title: string }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)

  // Sort items by startValidity
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aTime = a.startValidity ? new Date(a.startValidity).getTime() : 0
      const bTime = b.startValidity ? new Date(b.startValidity).getTime() : 0
      return aTime - bTime
    })
  }, [items])

  const currentItem = sortedItems[currentIndex]
  const imageUrl = `https://plan.navcanada.ca/weather/images/${currentItem?.pk}.image`

  // Auto-play functionality
  useMemo(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % sortedItems.length)
    }, 1500)
    return () => clearInterval(interval)
  }, [isPlaying, sortedItems.length])

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + sortedItems.length) % sortedItems.length)
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % sortedItems.length)
  }

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5))
  }

  if (!currentItem) return null

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-2 bg-muted/50">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium truncate">
            {title}
          </CardTitle>
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground shrink-0"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </CardHeader>

      {/* Image Content */}
      <CardContent className="p-0 relative bg-background">
        <div 
          className="relative overflow-auto"
          style={{ maxHeight: "500px" }}
        >
          <div 
            className="flex items-center justify-center min-h-[300px] p-2"
            style={{ 
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
              transition: "transform 0.2s ease"
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={title}
              className="max-w-full h-auto"
              loading="lazy"
            />
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>

      {/* Footer with Frame Selectors and Navigation */}
      <div className="border-t border-border bg-muted/50 p-3">
        {/* Frame Selectors */}
        {sortedItems.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {sortedItems.map((item, index) => (
              <Button
                key={item.pk}
                variant={index === currentIndex ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setCurrentIndex(index)}
              >
                {formatValidityTime(item.startValidity) || `Frame ${index + 1}`}
              </Button>
            ))}
          </div>
        )}

        {/* Navigation Controls */}
        {sortedItems.length > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handlePrev}
              title="Previous Frame"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleNext}
              title="Next Frame"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Validity Info */}
        <div className="text-center text-xs text-muted-foreground mt-2">
          {currentItem.startValidity && (
            <span>Valid: {new Date(currentItem.startValidity).toLocaleString()}</span>
          )}
          {sortedItems.length > 1 && (
            <span className="ml-2">
              ({currentIndex + 1} of {sortedItems.length})
            </span>
          )}
        </div>
      </div>
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

// Helper to create a grouping key for image products (to group frames together)
function getImageGroupKey(item: WeatherData): string {
  // Group by type and location/description to keep related frames together
  const type = normalizeProductType(item.type)
  const location = item.location || ""
  // Use the first part of text or description if available for sub-grouping
  return `${type}|${location}`
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

  // Group image products by their group key (to display frames together in panels)
  const imageGroups = useMemo(() => {
    if (!data?.data) return {}
    
    const groups: Record<string, WeatherData[]> = {}
    
    for (const item of data.data) {
      const normalizedType = normalizeProductType(item.type)
      if (isImageType(normalizedType)) {
        const groupKey = getImageGroupKey(item)
        if (!groups[groupKey]) {
          groups[groupKey] = []
        }
        groups[groupKey].push(item)
      }
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

  // Get text product types that have data
  const textProductTypes = Object.keys(grouped)
    .filter(type => !isImageType(type))
    .sort((a, b) => {
      const aIndex = PRODUCT_ORDER.indexOf(a)
      const bIndex = PRODUCT_ORDER.indexOf(b)
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })

  // Get image group keys sorted
  const imageGroupKeys = Object.keys(imageGroups).sort()

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

      {/* Text Products */}
      {textProductTypes.map(type => {
        const items = grouped[type]
        if (!items || items.length === 0) return null

        const label = PRODUCT_LABELS[type] || type

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
            <div className="grid gap-3">
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
                
                return <WeatherCard key={`${item.pk}-${index}`} item={item} />
              })}
            </div>
          </section>
        )
      })}

      {/* Image Products */}
      {imageGroupKeys.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-border pb-2">
            Graphical Products
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {imageGroupKeys.map(groupKey => {
              const items = imageGroups[groupKey]
              if (!items || items.length === 0) return null

              // Create a title from the group key
              const [type, location] = groupKey.split("|")
              const typeLabel = PRODUCT_LABELS[type] || type
              const title = location ? `${typeLabel} - ${location}` : typeLabel

              return (
                <ImagePanel
                  key={groupKey}
                  items={items}
                  title={title}
                />
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
