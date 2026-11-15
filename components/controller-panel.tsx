"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"

import { Prompter } from "@/components/prompter"
import { useControllerLease } from "@/components/use-controller-lease"
import { countdownRemaining, offsetAt, type Show, type ShowAction } from "@/lib/show-state"

function fieldFocused(fieldId: string): boolean {
  return typeof document !== "undefined" && document.activeElement?.id === fieldId
}

function useDraft(serverValue: string | null, fieldId: string) {
  const [draft, setDraft] = useState<string | null>(null)
  const [seen, setSeen] = useState<string | null>(null)
  if (serverValue != null && serverValue !== seen && !fieldFocused(fieldId)) {
    setSeen(serverValue)
    setDraft(serverValue)
  }
  return [draft, setDraft] as const
}

function statusLabel(show: Show, connected: boolean, at: number): string {
  if (!connected) return "Reconnecting"
  if (show.status === "paused") return "Paused"
  if (countdownRemaining(show, at) != null) return "Countdown"
  return "Playing"
}

function useControllerDrafts(
  show: Show | null,
  send: (action: ShowAction) => void,
  enabled: boolean,
) {
  const [text, setText] = useDraft(show ? show.text : null, "script")
  const [speed, setSpeed] = useDraft(show ? String(show.speed) : null, "speed")
  const [fontSize, setFontSize] = useDraft(
    show ? String(show.fontSize) : null,
    "font-size",
  )
  const sentText = useRef<string | null>(null)
  const sentSpeed = useRef<number | null>(null)
  const sentFontSize = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || text == null || text === show?.text || text === sentText.current) return
    const id = setTimeout(() => {
      sentText.current = text
      void send({ type: "text", text })
    }, 200)
    return () => clearTimeout(id)
  }, [enabled, text, show, send])

  useEffect(() => {
    if (!enabled || speed == null || speed.trim() === "" || !show) return
    const parsed = Number(speed)
    if (!Number.isFinite(parsed) || parsed === show.speed || parsed === sentSpeed.current) {
      return
    }
    const id = setTimeout(() => {
      sentSpeed.current = parsed
      void send({ type: "speed", speed: parsed })
    }, 200)
    return () => clearTimeout(id)
  }, [enabled, speed, show, send])

  useEffect(() => {
    if (!enabled || fontSize == null || fontSize.trim() === "" || !show) return
    const parsed = Number(fontSize)
    if (
      !Number.isFinite(parsed) ||
      parsed === show.fontSize ||
      parsed === sentFontSize.current
    ) {
      return
    }
    const id = setTimeout(() => {
      sentFontSize.current = parsed
      void send({ type: "fontSize", fontSize: parsed })
    }, 200)
    return () => clearTimeout(id)
  }, [enabled, fontSize, show, send])

  const ready = show != null && text != null && speed != null && fontSize != null
  return { text, setText, speed, setSpeed, fontSize, setFontSize, ready }
}

function PositionBar({
  show,
  now,
  ready,
  extent,
  send,
}: {
  show: Show | null
  now: () => number
  ready: boolean
  extent: number
  send: (action: ShowAction) => void
}) {
  const [at, setAt] = useState(0)
  const dragging = useRef(false)
  const [pending, setPending] = useState<number | null>(null)
  const moving = show != null && show.status !== "paused"

  useEffect(() => {
    if (!moving) return
    let frame = 0
    const tick = () => {
      setAt(now())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [moving, now])

  const liveOffset = show == null ? 0 : at === 0 ? show.offsetPx : offsetAt(show, at)
  const sliderMax = Math.max(0, extent)
  const clampedLive = sliderMax > 0 ? Math.min(Math.max(0, liveOffset), sliderMax) : 0
  if (
    !dragging.current &&
    pending != null &&
    show != null &&
    Math.abs(show.offsetPx - pending) <= 1
  ) {
    setPending(null)
  }

  function endDrag() {
    dragging.current = false
    setPending((current) =>
      current != null && show != null && Math.abs(show.offsetPx - current) <= 1
        ? null
        : current,
    )
  }
  const sliderOffset = Math.min(pending ?? clampedLive, sliderMax > 0 ? sliderMax : 0)
  const progress = sliderMax > 0 ? Math.round((sliderOffset / sliderMax) * 100) : 0

  return (
    <label className="flex flex-col gap-2 text-sm text-zinc-300" htmlFor="position">
      <span className="flex items-center justify-between">
        Position
        <span className="text-zinc-400">{progress}%</span>
      </span>
      <input
        id="position"
        className="h-8 w-full cursor-pointer accent-white disabled:cursor-default disabled:opacity-40"
        type="range"
        min={0}
        max={sliderMax > 0 ? sliderMax : 1}
        step={1}
        value={sliderMax > 0 ? sliderOffset : 0}
        disabled={!ready || sliderMax <= 0}
        aria-valuemin={0}
        aria-valuemax={sliderMax}
        aria-valuenow={Math.round(sliderOffset)}
        aria-valuetext={`${progress}% through the script`}
        onPointerDown={() => {
          dragging.current = true
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onBlur={endDrag}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (!Number.isFinite(next)) return
          setPending(next)
          void send({ type: "seek", offsetPx: next })
        }}
      />
    </label>
  )
}

function TakeoverDialog({
  onContinue,
  onCancel,
}: {
  onContinue: () => void
  onCancel: () => void
}) {
  const continueRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    continueRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 px-4 py-6 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="takeover-title"
        aria-describedby="takeover-body"
        className="w-full max-w-lg rounded-xl border border-white/15 bg-zinc-950 p-4"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel()
        }}
      >
        <h2 id="takeover-title" className="text-lg font-semibold">
          Another controller is connected
        </h2>
        <p id="takeover-body" className="mt-2 text-sm text-zinc-300">
          Another controller is already connected. If you continue, that controller will be
          disconnected and this screen will be the only one that works.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/15 px-3 py-3 text-base font-medium"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            ref={continueRef}
            type="button"
            className="rounded-lg bg-white px-3 py-3 text-base font-medium text-black"
            onClick={onContinue}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

export function ControllerPanel() {
  const {
    lease,
    replaced,
    show,
    connected,
    unauthorized,
    now,
    send,
    requestTakeover,
    confirmTakeover,
    cancelTakeover,
  } = useControllerLease()
  const active = lease === "active"
  const { text, setText, speed, setSpeed, fontSize, setFontSize, ready } =
    useControllerDrafts(show, send, active)
  const controlsReady = ready && active
  const [at, setAt] = useState(0)
  const [extent, setExtent] = useState(0)
  const moving = show != null && show.status !== "paused"
  const onExtent = useCallback((next: number) => {
    setExtent((current) => (Math.abs(current - next) < 0.5 ? current : next))
  }, [])

  useEffect(() => {
    if (!moving) return
    const update = () => setAt(now())
    const frame = requestAnimationFrame(update)
    const id = setInterval(update, 250)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(id)
    }
  }, [moving, now])

  const label = !active
    ? lease === "checking"
      ? "Connecting"
      : "Inactive"
    : show
      ? statusLabel(show, connected, at)
      : "Connecting"

  function run(action: ShowAction) {
    if (!active) return
    void send(action)
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Controller</h1>
        <p className="text-sm text-zinc-400">{label}</p>
      </header>

      {unauthorized && (
        <p className="rounded-lg border border-red-400/40 bg-red-950/60 px-3 py-2 text-sm" role="alert">
          The session expired.{" "}
          <Link className="underline" href="/login">
            Enter the password again
          </Link>
          .
        </p>
      )}

      {lease === "displaced" && (
        <div className="rounded-lg border border-white/15 bg-zinc-950 px-3 py-3 text-sm" role="alert">
          <p>
            {replaced
              ? "This screen was disconnected because another controller took over."
              : "This screen is not the active controller."}
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black"
            onClick={requestTakeover}
          >
            Use this screen
          </button>
        </div>
      )}

      {lease === "inactive" && (
        <div className="rounded-lg border border-white/15 bg-zinc-950 px-3 py-3 text-sm" role="status">
          <p>This screen is not the active controller.</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black"
            onClick={requestTakeover}
          >
            Use this screen
          </button>
        </div>
      )}

      {lease === "occupied" && (
        <TakeoverDialog onContinue={confirmTakeover} onCancel={cancelTakeover} />
      )}

      <label className="flex flex-col gap-1 text-sm text-zinc-300" htmlFor="script">
        Script
        <textarea
          id="script"
          className="min-h-40 w-full resize-y rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-base text-white outline-none focus:border-white/40"
          value={text ?? ""}
          disabled={!controlsReady}
          spellCheck
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-zinc-300" htmlFor="speed">
          Speed (px/s)
          <input
            id="speed"
            className="rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-base text-white outline-none focus:border-white/40"
            inputMode="decimal"
            min={0}
            max={300}
            step={1}
            type="number"
            value={speed ?? ""}
            disabled={!controlsReady}
            onChange={(event) => setSpeed(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-300" htmlFor="font-size">
          Text size (px)
          <input
            id="font-size"
            className="rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-base text-white outline-none focus:border-white/40"
            inputMode="decimal"
            min={8}
            max={200}
            step={1}
            type="number"
            value={fontSize ?? ""}
            disabled={!controlsReady}
            onChange={(event) => setFontSize(event.target.value)}
          />
        </label>
      </div>

      <button
        type="button"
        className="flex items-center justify-between rounded-lg border border-white/15 px-3 py-3 text-left text-base disabled:opacity-50"
        aria-pressed={show?.mirrored ?? false}
        disabled={!controlsReady}
        onClick={() => run({ type: "mirrored", mirrored: !show?.mirrored })}
      >
        Mirror
        <span className="text-sm text-zinc-400">{show?.mirrored ? "On" : "Off"}</span>
      </button>

      <PositionBar show={show} now={now} ready={controlsReady} extent={extent} send={send} />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-lg bg-white px-3 py-3 text-base font-medium text-black disabled:opacity-50"
          disabled={!controlsReady}
          onClick={() => run({ type: "play" })}
        >
          Play
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-3 text-base font-medium disabled:opacity-50"
          disabled={!controlsReady}
          onClick={() => run({ type: "pause" })}
        >
          Pause
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-3 text-base font-medium disabled:opacity-50"
          disabled={!controlsReady}
          onClick={() => run({ type: "nudge", direction: -1 })}
        >
          Rewind
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-3 text-base font-medium disabled:opacity-50"
          disabled={!controlsReady}
          onClick={() => run({ type: "nudge", direction: 1 })}
        >
          Forward
        </button>
      </div>

      <button
        type="button"
        className="rounded-lg border border-white/15 px-3 py-3 text-base font-medium disabled:opacity-50"
        disabled={!controlsReady}
        onClick={() => run({ type: "reset" })}
      >
        Reset
      </button>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm text-zinc-300">Live view</h2>
        <div className="aspect-video overflow-hidden rounded-lg border border-white/10">
          {show ? (
            <Prompter show={show} now={now} onExtent={onExtent} />
          ) : (
            <div className="h-full w-full bg-black" />
          )}
        </div>
      </section>
    </main>
  )
}
