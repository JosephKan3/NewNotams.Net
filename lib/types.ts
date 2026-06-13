export interface ImageFrame {
  id: number
  sv: string // start validity
  ev: string // end validity
  images: { id: number; created: string }[]
}

export interface FrameList {
  id: number
  sv: string
  ev: string
  frames: ImageFrame[]
}

export interface ImageProductData {
  product: string
  sub_product: string
  geography: string
  sub_geography: string
  frame_lists: FrameList[]
}

export interface WeatherData {
  type: string
  pk: string
  location: string
  startValidity: string
  endValidity: string | null
  text: string
  hasError: boolean
  position: {
    pointReference: string
    radialDistance: number
  }
  // For image products - parsed from text JSON
  imageData?: ImageProductData
}

export interface WeatherResponse {
  meta: {
    now: string
    count: Record<string, number>
    messages: string[]
  }
  data: WeatherData[]
}

export interface SearchParams {
  sites: string[]
  products: {
    // Text products
    sigmet: boolean
    airmet: boolean
    notam: boolean
    metar: boolean
    taf: boolean
    pirep: boolean
    upperwind: boolean
    space_weather: boolean
    // BC VFR Route Forecast
    bc_vfr_route: boolean
    // Analysis charts
    analysis_250: boolean
    analysis_500_thickness: boolean
    analysis_500_vorticity: boolean
    analysis_700: boolean
    analysis_850: boolean
    analysis_surface: boolean
    // Radar
    radar_national_echotop: boolean
    radar_national_cappi_rain: boolean
    radar_national_cappi_snow: boolean
    radar_regional_echotop: boolean
    radar_regional_cappi_rain: boolean
    radar_regional_cappi_snow: boolean
    radar_individual_echotop: boolean
    radar_individual_cappi_rain: boolean
    radar_individual_cappi_snow: boolean
    // Satellite
    satellite_infrared: boolean
    satellite_visible: boolean
    satellite_yukon_nwt: boolean
    // Graphical Forecast
    gfa_clouds_weather: boolean
    gfa_icing_turb_freezing: boolean
    gfa_local_bc: boolean
    // Significant Weather
    sigwx_high: boolean
    sigwx_mid: boolean
    sigwx_surface: boolean
    // Turbulence
    turb_all: boolean
    // Wind levels
    wind_3000: boolean
    wind_6000: boolean
    wind_9000: boolean
    wind_12000: boolean
    wind_fl180: boolean
    wind_fl240: boolean
    wind_fl340: boolean
    wind_fl390: boolean
    wind_fl450: boolean
  }
  notamLanguage: "default" | "english" | "french"
  metarHours: string
  routeRadius: number | null
  showDuplicates: boolean
}

export interface NotamParsed {
  id: string
  raw: string
  english: string | null
  french: string | null
}

export interface DismissedNotamMeta {
  id: string
  raw: string
  location: string | null
}

// Text product types
export const TEXT_PRODUCT_TYPES = [
  "sigmet",
  "airmet",
  "notam",
  "metar",
  "taf",
  "pirep",
  "upperwind",
  "space_weather",
  "vfr_route",
] as const

// Image product types
export const IMAGE_PRODUCT_TYPES = [
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
] as const

export const PRODUCT_LABELS: Record<string, string> = {
  // Text products
  notam: "NOTAM",
  metar: "METAR",
  taf: "TAF",
  sigmet: "SIGMET",
  airmet: "AIRMET",
  pirep: "PIREP",
  upperwind: "Upper Wind",
  space_weather: "Space Weather",
  vfr_route: "BC VFR Route Forecast",
  // Image products
  upper_analysis: "Upper Analysis",
  surface_analysis: "Surface Analysis",
  composite_radar: "Composite Radar",
  radar: "Radar",
  satellite: "Satellite",
  gfa: "Graphical Area Forecast",
  lgf: "Local Graphical Forecast (BC)",
  sig_wx: "Significant Weather",
  turbulence: "Turbulence",
  low_level_wind: "Low Level Wind",
  high_level_wind: "High Level Wind",
  LOW_LEVEL_WIND: "Low Level Wind",
  HIGH_LEVEL_WIND: "High Level Wind",
  GFA: "Graphical Area Forecast",
  SURFACE_ANALYSIS: "Surface Analysis",
  UPPER_ANALYSIS: "Upper Analysis",
  COMPOSITE_RADAR: "Composite Radar",
  SATELLITE: "Satellite",
  SIG_WX: "Significant Weather",
  TURBULENCE: "Turbulence",
}

export function parseNotamId(text: string): string | null {
  try {
    const parsed = JSON.parse(text)
    const raw = parsed.raw as string
    // Extract NOTAM ID from format like "(J7655/25 NOTAMN" or "(A4802/26 NOTAMR"
    const match = raw.match(/\(([A-Z]\d+\/\d+)\s+NOTAM/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export function parseNotamText(text: string): NotamParsed | null {
  try {
    const parsed = JSON.parse(text)
    const raw = parsed.raw as string
    const match = raw.match(/\(([A-Z]\d+\/\d+)\s+NOTAM/)
    return {
      id: match ? match[1] : "UNKNOWN",
      raw: parsed.raw,
      english: parsed.english,
      french: parsed.french,
    }
  } catch {
    return null
  }
}

export function parseImageProductData(text: string): ImageProductData | null {
  try {
    const parsed = JSON.parse(text)
    if (parsed.frame_lists) {
      return parsed as ImageProductData
    }
    return null
  } catch {
    return null
  }
}

export function isTextProduct(type: string): boolean {
  return TEXT_PRODUCT_TYPES.includes(type as typeof TEXT_PRODUCT_TYPES[number])
}

export function isImageProduct(type: string): boolean {
  const lowerType = type.toLowerCase()
  return IMAGE_PRODUCT_TYPES.some(t => lowerType.includes(t.replace(/_/g, ""))) ||
    lowerType === "image"
}

// Extract all image IDs from an ImageProductData structure
// Only uses the most recent frame_list (latest start validity)
export function extractImageIds(data: ImageProductData): { id: number; sv: string; ev: string }[] {
  const images: { id: number; sv: string; ev: string }[] = []
<<<<<<< HEAD
  
  if (data.frame_lists.length === 0) return images
  
=======

  if (data.frame_lists.length === 0) return images

>>>>>>> ea414d4c4fa3af15ecaf84c980ba16b0089ad78e
  // Find the most recent frame_list by start validity
  const latestFrameList = data.frame_lists.reduce((latest, current) => {
    const latestDate = new Date(latest.sv)
    const currentDate = new Date(current.sv)
    return currentDate > latestDate ? current : latest
  })
<<<<<<< HEAD
  
  for (const frame of latestFrameList.frames) {
    // Get the latest image for each frame
=======

  for (const frame of latestFrameList.frames) {
>>>>>>> ea414d4c4fa3af15ecaf84c980ba16b0089ad78e
    if (frame.images.length > 0) {
      const latestImage = frame.images[frame.images.length - 1]
      images.push({
        id: latestImage.id,
        sv: frame.sv,
        ev: frame.ev,
      })
    }
  }

  return images
}
