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
