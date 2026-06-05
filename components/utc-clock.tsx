"use client"

import { useState, useEffect } from "react"

export function UtcClock({ className }: { className?: string }) {
  const [time, setTime] = useState("")

  useEffect(() => {
    function tick() {
      const now = new Date()
      const hh = now.getUTCHours().toString().padStart(2, "0")
      const mm = now.getUTCMinutes().toString().padStart(2, "0")
      const ss = now.getUTCSeconds().toString().padStart(2, "0")
      setTime(`${hh}:${mm}:${ss}Z`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className={className}>
      {time}
    </span>
  )
}
