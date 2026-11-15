"use client"

import { useEffect } from "react"

import { Prompter } from "@/components/prompter"
import { useShow } from "@/components/use-show"

function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const request = async () => {
      if (!("wakeLock" in navigator) || cancelled) return
      try {
        lock = await navigator.wakeLock.request("screen")
      } catch {
        // A later tap on the display retries the lock.
      }
    }

    void request()
    const onPointer = () => {
      void request()
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") void request()
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("visibilitychange", onVisibility)
      void lock?.release()
    }
  }, [])
}

export default function DisplayPage() {
  const { show, connected, now } = useShow()
  useWakeLock()

  return (
    <div className="fixed inset-0 cursor-none touch-none overflow-hidden overscroll-none bg-black">
      {show ? <Prompter show={show} now={now} /> : null}
      <p
        className={`pointer-events-none absolute bottom-14 left-4 z-30 text-sm ${
          connected ? "text-green-500" : "text-red-500"
        }`}
      >
        {connected ? "Connected" : "Disconnected"}
      </p>
      <button
        type="button"
        className="pointer-events-auto absolute right-4 bottom-4 z-30 cursor-pointer rounded border border-white/20 bg-black/70 px-2 py-1 text-xs text-white"
        onClick={() => window.location.reload()}
      >
        Refresh
      </button>
    </div>
  )
}
