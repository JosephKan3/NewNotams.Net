export interface WeatherData {
  type: "notam" | "metar" | "taf" | "sigmet" | "airmet" | "pirep" | "upperwind" | "space_weather"
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
    sigmet: boolean
    airmet: boolean
    notam: boolean
    metar: boolean
    taf: boolean
    pirep: boolean
    upperwind: boolean
    space_weather: boolean
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
