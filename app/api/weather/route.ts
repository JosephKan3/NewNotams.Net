import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  
  // Build the URL for Nav Canada API
  const url = new URL("https://plan.navcanada.ca/weather/api/alpha/")
  
  // Forward all query parameters
  searchParams.forEach((value, key) => {
    if (key === "site") {
      // site can have multiple values
      const sites = searchParams.getAll("site")
      sites.forEach(site => url.searchParams.append("site", site))
    } else if (key === "alpha") {
      // alpha can have multiple values
      const alphas = searchParams.getAll("alpha")
      alphas.forEach(alpha => url.searchParams.append("alpha", alpha))
    } else {
      url.searchParams.set(key, value)
    }
  })
  
  // Add timestamp to prevent caching
  url.searchParams.set("_", Date.now().toString())

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "NewNotams.Net/1.0",
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch data from Nav Canada" },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error fetching from Nav Canada:", error)
    return NextResponse.json(
      { error: "Failed to connect to Nav Canada API" },
      { status: 500 }
    )
  }
}
