"use client"

import { useLayoutEffect, useRef, useState } from "react"

import {
  countdownRemaining,
  COUNTDOWN_MS,
  LINE_HEIGHT,
  offsetAt,
  READING_LINE,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Show,
} from "@/lib/show-state"

// The animation clock keeps the last timestamp after pause. A sample from
// before this play or countdown would rewind the script for a frame.
function playbackInstant(show: Show, frameTime: number | null): number | null {
  if (frameTime == null || show.status === "paused") return null
  if (show.status === "playing") {
    return show.playingSince != null && frameTime >= show.playingSince ? frameTime : null
  }
  if (show.status === "countdown" && show.countdownEndsAt != null) {
    const startedAt = show.countdownEndsAt - COUNTDOWN_MS
    return frameTime >= startedAt ? frameTime : null
  }
  return null
}

export function Prompter({
  show,
  now,
  onExtent,
}: {
  show: Show
  now: () => number
  onExtent?: (extentPx: number) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [frameTime, setFrameTime] = useState<number | null>(null)
  const moving = show.status !== "paused"

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      const { width, height } = frame.getBoundingClientRect()
      if (width === 0 || height === 0) return
      setScale(Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const text = textRef.current
    if (!text || !onExtent) return
    const measure = () => {
      const style = getComputedStyle(text)
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      onExtent(Math.max(0, text.scrollHeight - padding))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(text)
    return () => observer.disconnect()
  }, [onExtent, show.fontSize, show.text])

  useLayoutEffect(() => {
    if (!moving) return
    let frame = 0
    const tick = () => {
      setFrameTime(now())
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [moving, now])

  const anchor = STAGE_HEIGHT * READING_LINE
  const instant = playbackInstant(show, frameTime)
  const offset = instant == null ? show.offsetPx : offsetAt(show, instant)
  const countdown = instant == null ? null : countdownRemaining(show, instant)

  return (
    <div ref={frameRef} className="relative h-full w-full overflow-hidden bg-black">
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <div className="relative h-full w-full overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-white"
            style={{ top: anchor }}
          />
          <div style={{ transform: show.mirrored ? "scaleX(-1)" : undefined }}>
            <div
              ref={textRef}
              className="px-16 text-center font-semibold text-white select-none"
              style={{
                fontSize: show.fontSize,
                lineHeight: LINE_HEIGHT,
                paddingTop: anchor,
                paddingBottom: STAGE_HEIGHT - anchor,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                transform: `translate3d(0, ${-offset}px, 0)`,
              }}
            >
              {show.text}
            </div>
          </div>
          {countdown != null && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 text-[10rem] leading-none font-semibold text-white">
              {countdown}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
