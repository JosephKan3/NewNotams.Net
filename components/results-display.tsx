"use client"

import { useMemo, useState, useEffect } from "react"
import { Eye, EyeOff, RotateCcw, X, ExternalLink, ChevronLeft, ChevronRight, Play, Pause, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { WeatherData, WeatherResponse, ImageProductData } from "@/lib/types"
import { parseNotamText, parseNotamId, PRODUCT_LABELS, parseImageProductData, extractImageIds } from "@/lib/types"
import type { DismissedNotamMeta } from "@/hooks/use-dismissed-notams"

interface ResultsDisplayProps {
  data: WeatherResponse | null
  dismissedNotams: DismissedNotamMeta[]
  onDismiss: (id: string, raw: string, location: string | null) => void
  onRestore: (id: string) => void
  onRestoreAll: () => void
  isDismissed: (id: string) => boolean
}

// Order for displaying products — NOTAMs rendered separately at the very bottom
const PRODUCT_ORDER = [
  "sigmet",
  "airmet",
  "metar",
  "taf",
  "pirep",
  "upperwind",
  "space_weather",
  "vfr_route",
]

function JumpToLegend({ sections }: { sections: { id: string; label: string; count?: number }[] }) {
  if (sections.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 -mx-4 px-4 border-b border-border">
      <span className="text-xs text-muted-foreground shrink-0">Jump to:</span>
      {sections.map(s => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          {s.label}
          {s.count !== undefined && (
            <span className="text-muted-foreground">({s.count})</span>
          )}
        </a>
      ))}
    </div>
  )
}


function NotamCard({
  item,
  onDismiss,
}: {
  item: WeatherData
  onDismiss: (id: string, raw: string, location: string | null) => void
}) {
  const parsed = parseNotamText(item.text)
  const notamId = parsed?.id || parseNotamId(item.text) || item.pk
  const raw = parsed?.raw || item.text

  return (
    <div className="group relative border-b border-border px-3 py-3 last:border-b-0">
      <div className="flex items-start gap-3 min-w-0">
        <pre className="flex-1 min-w-0 whitespace-pre-wrap font-mono text-sm text-muted-foreground leading-relaxed">
          {raw}
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 opacity-50 hover:opacity-100"
          onClick={() => onDismiss(notamId, raw, item.location)}
          title="Dismiss this NOTAM"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

function WeatherCard({ item }: { item: WeatherData }) {
  // Try to parse the text as JSON to extract raw content
  let displayText = item.text
  try {
    const parsed = JSON.parse(item.text)
    if (parsed.raw) {
      displayText = parsed.raw
    }
  } catch {
    // Use text as-is
  }

  return (
    <div className="border-b border-border px-3 py-3 last:border-b-0 min-w-0">
      <pre className="whitespace-pre-wrap font-mono text-sm text-muted-foreground leading-relaxed min-w-0">
        {displayText}
      </pre>
    </div>
  )
}

// Upper Wind altitude columns (in feet)
const UPPER_WIND_ALTITUDES = [3000, 6000, 9000, 12000, 18000, 24000, 30000, 34000, 39000, 45000, 53000]

// Wind data entry: [altitude, direction, speed, temperature?]
type WindDataEntry = [number, number, number?, number?]

// Parse upper wind JSON data
// Format: ["FBCN35", "KWNO", "issue_time", "start_validity", "end_validity", "use_start", "use_end", null, null, null, null, [[altitude, dir, speed, temp], ...]]
function parseUpperWindData(text: string): {
  windData: Record<number, { dir: number | null; speed: number; temp?: number | null }>;
  validity: string;
  useTime: string;
  source: string;
} | null {
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return null
    
    // Extract wind data array (last element that is an array of arrays)
    const windArray = parsed.find((item, idx) => 
      idx >= 11 && Array.isArray(item) && item.length > 0 && Array.isArray(item[0])
    ) as WindDataEntry[] | undefined
    
    if (!windArray) return null
    
    // Extract validity times
    const startValidity = parsed[3] as string // ISO timestamp
    const useStart = parsed[5] as string // Use period start
    const useEnd = parsed[6] as string // Use period end
    const source = parsed[1] as string // KWNO or CWAO
    
    // Format validity string (e.g., "071800Z")
    const validityDate = new Date(startValidity)
    const validityStr = `${validityDate.getUTCDate().toString().padStart(2, '0')}${validityDate.getUTCHours().toString().padStart(2, '0')}00Z`
    
    // Format use time (e.g., "12-00")
    const useStartDate = new Date(useStart)
    const useEndDate = new Date(useEnd)
    const useTimeStr = `${useStartDate.getUTCHours().toString().padStart(2, '0')}-${useEndDate.getUTCHours().toString().padStart(2, '0')}`
    
    // Parse wind data into altitude-keyed object
    const windData: Record<number, { dir: number | null; speed: number; temp?: number | null }> = {}
    for (const entry of windArray) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const [altitude, direction, speed, temp] = entry
        windData[altitude] = {
          dir: direction ?? null,
          speed: speed ?? 0,
          temp: temp ?? null,
        }
      }
    }
    
    return { windData, validity: validityStr, useTime: useTimeStr, source }
  } catch {
    return null
  }
}

// Format wind value for display (e.g., "250 46 +9" or "250 46")
function formatWindValue(data: { dir: number | null; speed: number; temp?: number | null } | undefined): string {
  if (!data) return "-"
  const { dir, speed, temp } = data
  const dirStr = dir != null ? dir.toString().padStart(3, '0') : "---"
  const speedStr = speed.toString().padStart(2, ' ')
  if (temp != null) {
    const tempSign = temp >= 0 ? '+' : ''
    return `${dirStr} ${speedStr} ${tempSign}${temp}`
  }
  return `${dirStr} ${speedStr}`
}

// Component to display Upper Wind data in tabular format
function UpperWindSection({ items }: { items: WeatherData[] }) {
  // Group items by validity time
  const groupedByValidity = useMemo(() => {
    interface WindGroup {
      validity: string
      useTime: string
      entries: { location: string; windData: Record<number, { dir: number | null; speed: number; temp?: number | null }> }[]
    }
    const groups: Record<string, WindGroup> = {}
    
    for (const item of items) {
      const parsed = parseUpperWindData(item.text)
      if (!parsed) continue
      
      const validityKey = `${parsed.validity}_${parsed.useTime}`
      
      if (!groups[validityKey]) {
        groups[validityKey] = { 
          validity: parsed.validity, 
          useTime: parsed.useTime, 
          entries: [] 
        }
      }
      
      // Check if we already have this location
      const existingEntry = groups[validityKey].entries.find(e => e.location === item.location)
      if (existingEntry) {
        // Merge wind data (some sources have different altitudes)
        Object.assign(existingEntry.windData, parsed.windData)
      } else {
        groups[validityKey].entries.push({ 
          location: item.location, 
          windData: parsed.windData 
        })
      }
    }
    
    return Object.values(groups)
  }, [items])

  if (groupedByValidity.length === 0) {
    return null
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold border-b border-border pb-2">
        Upper Wind
      </h2>
      
      {groupedByValidity.map((group, groupIndex) => (
        <Card key={groupIndex}>
          <CardHeader className="py-2 bg-muted/50">
            <div className="font-mono text-sm">
              VALID {group.validity} FOR USE {group.useTime}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-2 py-2 text-left font-medium w-16"></th>
                    {UPPER_WIND_ALTITUDES.map(alt => (
                      <th key={alt} className="px-2 py-2 text-center font-medium whitespace-nowrap border-l border-border">
                        {alt}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.entries.map((entry, entryIndex) => (
                    <tr key={entryIndex} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2 font-medium">
                        {entry.location}
                      </td>
                      {UPPER_WIND_ALTITUDES.map(alt => (
                        <td key={alt} className="px-2 py-2 text-center text-muted-foreground border-l border-border whitespace-nowrap">
                          {formatWindValue(entry.windData[alt])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}

// Format validity time for display (e.g., "04 18" from ISO timestamp)
// Note: Nav Canada timestamps don't include "Z" suffix but ARE UTC times
function formatValidityTime(timestamp: string): string {
  if (!timestamp) return ""
  // Parse directly — format is YYYY-MM-DDTHH:MM:SS (UTC, missing Z suffix)
  const match = timestamp.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!match) return ""
  const [, , , day, hours, minutes] = match
  if (minutes === "00") {
    return `${day} ${hours}`
  }
  return `${day} ${hours}${minutes}`
}

// Image Panel with frame navigation - similar to Nav Canada's UI
function ImagePanel({ 
  imageData, 
  title,
  location 
}: { 
  imageData: ImageProductData
  title: string
  location: string
}) {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)

  // Extract all frames with their image IDs
  const frames = useMemo(() => {
    return extractImageIds(imageData)
  }, [imageData])

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return
    const interval = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % frames.length)
    }, 1500)
    return () => clearInterval(interval)
  }, [isPlaying, frames.length])

  const currentFrame = frames[currentFrameIndex]
  const imageUrl = currentFrame ? `https://plan.navcanada.ca/weather/images/${currentFrame.id}.image` : ""

  const handlePrev = () => {
    setCurrentFrameIndex((prev) => (prev - 1 + frames.length) % frames.length)
  }

  const handleNext = () => {
    setCurrentFrameIndex((prev) => (prev + 1) % frames.length)
  }

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5))
  }

  if (frames.length === 0) return null

  // Build descriptive title
  const fullTitle = [
    PRODUCT_LABELS[imageData.product] || imageData.product,
    imageData.sub_product,
    imageData.geography,
    imageData.sub_geography,
  ].filter(Boolean).join(" / ")

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-2 bg-muted/50">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">
            {fullTitle || title}
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
          style={{ maxHeight: "600px" }}
        >
          <div 
            className="flex items-center justify-center min-h-[300px]"
            style={{ 
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              transition: "transform 0.2s ease"
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={fullTitle || title}
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
        {frames.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {frames.map((frame, index) => (
              <Button
                key={frame.id}
                variant={index === currentFrameIndex ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setCurrentFrameIndex(index)}
              >
                {formatValidityTime(frame.sv)}
              </Button>
            ))}
          </div>
        )}

        {/* Navigation Controls */}
        {frames.length > 1 && (
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
        {currentFrame && (
          <div className="text-center text-xs text-muted-foreground mt-2">
            <span>Valid: {formatValidityTime(currentFrame.sv)} - {formatValidityTime(currentFrame.ev)}</span>
            {frames.length > 1 && (
              <span className="ml-2">
                ({currentFrameIndex + 1} of {frames.length})
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function DismissedNotamsSection({
  dismissedNotams,
  onRestore,
  onRestoreAll,
}: {
  dismissedNotams: DismissedNotamMeta[]
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
      <CollapsibleContent className="mt-3 border rounded-lg divide-y divide-border overflow-hidden">
        {dismissedNotams.map((notam) => (
          <div key={notam.id} className="px-3 py-3 opacity-60 hover:opacity-80">
            <div className="flex items-start gap-3 min-w-0">
              <pre className="flex-1 min-w-0 whitespace-pre-wrap font-mono text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {notam.raw || notam.id}
              </pre>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRestore(notam.id)}
                className="shrink-0 h-6 px-2 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Restore
              </Button>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

// Helper to check if an item is an image product
function isImageProductItem(item: WeatherData): boolean {
  // Check if type is "image" or if the text contains frame_lists
  if (item.type === "image") return true
  try {
    const parsed = JSON.parse(item.text)
    return !!parsed.frame_lists
  } catch {
    return false
  }
}

export function ResultsDisplay({
  data,
  dismissedNotams,
  onDismiss,
  onRestore,
  onRestoreAll,
  isDismissed,
}: ResultsDisplayProps) {
  // Separate text and image products
  const { textProducts, imageProducts } = useMemo(() => {
    if (!data?.data) return { textProducts: {}, imageProducts: [] }

    const textGroups: Record<string, WeatherData[]> = {}
    const images: { item: WeatherData; parsed: ImageProductData }[] = []

    for (const item of data.data) {
      if (isImageProductItem(item)) {
        const parsed = parseImageProductData(item.text)
        if (parsed) {
          images.push({ item, parsed })
        }
      } else {
        const type = item.type.toLowerCase()
        if (!textGroups[type]) {
          textGroups[type] = []
        }
        textGroups[type].push(item)
      }
    }

    return { textProducts: textGroups, imageProducts: images }
  }, [data])

  // NOTAMs visible in the current results (globally dismissed ones are filtered out)
  const visibleNotams = useMemo(() => {
    return (textProducts.notam || []).filter(item => {
      const parsed = parseNotamText(item.text)
      const id = parsed?.id || parseNotamId(item.text) || item.pk
      return !isDismissed(id)
    })
  }, [textProducts.notam, isDismissed])

  const visibleNotamCount = visibleNotams.length

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

  // Non-NOTAM text product types, sorted by PRODUCT_ORDER
  const textProductTypes = Object.keys(textProducts)
    .filter(t => t !== "notam")
    .sort((a, b) => {
      const aIndex = PRODUCT_ORDER.indexOf(a)
      const bIndex = PRODUCT_ORDER.indexOf(b)
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })

  // Build legend sections (in render order: text → images → notams)
  const legendSections = [
    ...textProductTypes.map(type => ({
      id: `section-${type}`,
      label: PRODUCT_LABELS[type] || type.toUpperCase(),
    })),
    ...(imageProducts.length > 0 ? [{ id: "section-images", label: "Graphical Products", count: imageProducts.length }] : []),
    ...(textProducts.notam?.length ? [{ id: "section-notam", label: "NOTAMs", count: visibleNotamCount }] : []),
  ]

  return (
    <div className="space-y-6">
      {/* Jump-to legend */}
      <JumpToLegend sections={legendSections} />

      {/* Summary */}
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <span>Results:</span>
        {Object.entries(data.meta.count).map(([type, count]) => {
          const label = PRODUCT_LABELS[type.toLowerCase()] || PRODUCT_LABELS[type] || type
          const isNotam = type.toLowerCase() === "notam"
          return (
            <Badge key={type} variant="outline">
              {label}: {isNotam ? visibleNotamCount : count}
              {isNotam && dismissedNotams.length > 0 && (
                <span className="ml-1 opacity-60">({dismissedNotams.length} dismissed)</span>
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

      {/* Non-NOTAM Text Products */}
      {textProductTypes.map(type => {
        const items = textProducts[type]
        if (!items || items.length === 0) return null

        if (type === "upperwind") {
          return (
            <section key={type} id="section-upperwind">
              <UpperWindSection items={items} />
            </section>
          )
        }

        const label = PRODUCT_LABELS[type] || type.toUpperCase()

        return (
          <section key={type} id={`section-${type}`}>
            <h2 className="text-lg font-semibold border-b border-border pb-2 mb-2">
              {label}
            </h2>
            <div className="border rounded-lg divide-y-0 overflow-hidden">
              {items.map((item, index) => (
                <WeatherCard key={`${item.pk}-${index}`} item={item} />
              ))}
            </div>
          </section>
        )
      })}

      {/* Image Products */}
      {imageProducts.length > 0 && (
        <section id="section-images" className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-border pb-2">
            Graphical Products ({imageProducts.length})
          </h2>
          <div className="space-y-4">
            {imageProducts.map(({ item, parsed }, index) => (
              <ImagePanel
                key={`image-${data?.meta.now}-${item.pk}-${index}`}
                imageData={parsed}
                title={parsed.product || item.type}
                location={item.location}
              />
            ))}
          </div>
        </section>
      )}

      {/* NOTAMs — always last */}
      {visibleNotams.length > 0 && (
        <section id="section-notam">
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-2">
            NOTAMs
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({visibleNotamCount} visible)
            </span>
          </h2>
          <div className="border rounded-lg divide-y-0 overflow-hidden">
            {visibleNotams.map((item, index) => (
              <NotamCard
                key={`${item.pk}-${index}`}
                item={item}
                onDismiss={onDismiss}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
