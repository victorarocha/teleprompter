"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { Show, ShowAction } from "@/lib/show-state"

export function useShow() {
  const [show, setShow] = useState<Show | null>(null)
  const [connected, setConnected] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)
  const clockOffset = useRef(0)

  const applySnapshot = useCallback((next: Show, serverNow: number) => {
    clockOffset.current = serverNow - Date.now()
    setShow(next)
  }, [])

  useEffect(() => {
    const source = new EventSource("/api/show/stream")
    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { show?: Show; serverNow?: number }
        if (!data.show || typeof data.serverNow !== "number") return
        applySnapshot(data.show, data.serverNow)
      } catch {
        // Ignore a malformed event and wait for the next one.
      }
    }
    return () => source.close()
  }, [applySnapshot])

  const now = useCallback(() => Date.now() + clockOffset.current, [])

  const send = useCallback(
    async (action: ShowAction) => {
      const response = await fetch("/api/show", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      })
      if (response.status === 401) {
        setUnauthorized(true)
        return
      }
      if (!response.ok) return
      const data = (await response.json()) as { show: Show; serverNow: number }
      applySnapshot(data.show, data.serverNow)
    },
    [applySnapshot],
  )

  return { show, connected, unauthorized, now, send }
}
