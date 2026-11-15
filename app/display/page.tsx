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
  const { show, now } = useShow()
  useWakeLock()

  return (
    <div className="fixed inset-0 cursor-none touch-none overflow-hidden overscroll-none bg-black">
      {show ? <Prompter show={show} now={now} /> : null}
    </div>
  )
}
