"use client"

import { useMemo, useState, useEffect } from "react"
import { Eye, EyeOff, RotateCcw, X, ExternalLink, ChevronLeft, ChevronRight, Play, Pause, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { WeatherData, WeatherResponse, ImageProductData } from "@/lib/types"
import { parseNotamText, parseNotamId, PRODUCT_LABELS, parseImageProductData, extractImageIds } from "@/lib/types"

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
          {displayText}
        </pre>
      </CardContent>
    </Card>
  )
}

// Format validity time for display (e.g., "07 0000" from ISO timestamp)
function formatValidityTime(timestamp: string): string {
  if (!timestamp) return ""
  const date = new Date(timestamp)
  const day = date.getUTCDate().toString().padStart(2, "0")
  const hours = date.getUTCHours().toString().padStart(2, "0")
  const minutes = date.getUTCMinutes().toString().padStart(2, "0")
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
  dismissedIds,
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

  // Get dismissed NOTAMs that were in the current results
  const dismissedNotams = useMemo(() => {
    const notams = textProducts.notam || []
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
  }, [textProducts.notam, dismissedIds])

  // Count visible NOTAMs
  const visibleNotamCount = useMemo(() => {
    const notams = textProducts.notam || []
    return notams.filter(item => {
      const parsed = parseNotamText(item.text)
      const id = parsed?.id || parseNotamId(item.text) || item.pk
      return !isDismissed(id)
    }).length
  }, [textProducts.notam, isDismissed])

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

  // Get text product types that have data, sorted by PRODUCT_ORDER
  const textProductTypes = Object.keys(textProducts)
    .sort((a, b) => {
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
          const label = PRODUCT_LABELS[type.toLowerCase()] || PRODUCT_LABELS[type] || type
          const isNotam = type.toLowerCase() === "notam"
          return (
            <Badge key={type} variant="outline">
              {label}: {isNotam ? visibleNotamCount : count}
              {isNotam && dismissedNotams.length > 0 && (
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
        const items = textProducts[type]
        if (!items || items.length === 0) return null

        const label = PRODUCT_LABELS[type] || type.toUpperCase()

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
      {imageProducts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b border-border pb-2">
            Graphical Products
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {imageProducts.map(({ item, parsed }, index) => (
              <ImagePanel
                key={`${item.pk}-${index}`}
                imageData={parsed}
                title={item.type}
                location={item.location}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
