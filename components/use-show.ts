"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { Show, ShowAction } from "@/lib/show-state"

export type ControllerHolder = {
  id: string | null
  version: number
}

type ShowStreamMessage = {
  show?: Show
  serverNow?: number
  controllerId?: string | null
  leaseVersion?: number
}

export function useShow(options?: {
  controllerId?: string | null
  onDisplaced?: () => void
  onHolder?: (holder: ControllerHolder) => void
}) {
  const controllerId = options?.controllerId ?? null
  const onDisplaced = options?.onDisplaced
  const onHolder = options?.onHolder
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
        const data = JSON.parse(event.data) as ShowStreamMessage
        if (!data.show || typeof data.serverNow !== "number") return
        const nextId = typeof data.controllerId === "string" ? data.controllerId : null
        const version = typeof data.leaseVersion === "number" ? data.leaseVersion : 0
        onHolder?.({ id: nextId, version })
        applySnapshot(data.show, data.serverNow)
      } catch {
        // Ignore a malformed event and wait for the next one.
      }
    }
    return () => source.close()
  }, [applySnapshot, onHolder])

  const now = useCallback(() => Date.now() + clockOffset.current, [])

  const send = useCallback(
    async (action: ShowAction) => {
      if (!controllerId) return
      const response = await fetch("/api/show", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Controller-Id": controllerId,
        },
        body: JSON.stringify(action),
      })
      if (response.status === 401) {
        setUnauthorized(true)
        return
      }
      if (response.status === 409) {
        onDisplaced?.()
        return
      }
      if (!response.ok) return
      const data = (await response.json()) as { show: Show; serverNow: number }
      applySnapshot(data.show, data.serverNow)
    },
    [applySnapshot, controllerId, onDisplaced],
  )

  return { show, connected, unauthorized, now, send }
}
