"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"

import { Prompter } from "@/components/prompter"
import { useControllerLease } from "@/components/use-controller-lease"
import {
  countdownRemaining,
  DEFAULT_READING_LINE,
  MAX_FONT_SIZE,
  MAX_SPEED,
  MIN_FONT_SIZE,
  MIN_SPEED,
  offsetAt,
  type Show,
  type ShowAction,
} from "@/lib/show-state"

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

function statusLabel(
  t: (key: "reconnecting" | "paused" | "countdown" | "playing") => string,
  show: Show,
  connected: boolean,
  at: number,
): string {
  if (!connected) return t("reconnecting")
  if (show.status === "paused") return t("paused")
  if (countdownRemaining(show, at) != null) return t("countdown")
  return t("playing")
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
  const [readingLine, setReadingLine] = useDraft(
    show ? String(Math.round(show.readingLine * 100)) : null,
    "reading-line",
  )
  const sentText = useRef<string | null>(null)
  const sentSpeed = useRef<number | null>(null)
  const sentFontSize = useRef<number | null>(null)
  const sentReadingLine = useRef<number | null>(null)

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

  useEffect(() => {
    if (!enabled || readingLine == null || readingLine.trim() === "" || !show) return
    const percent = Number(readingLine)
    if (!Number.isFinite(percent)) return
    const fraction = Math.round(percent) / 100
    if (fraction === show.readingLine || fraction === sentReadingLine.current) return
    const id = setTimeout(() => {
      sentReadingLine.current = fraction
      void send({ type: "readingLine", readingLine: fraction })
    }, 200)
    return () => clearTimeout(id)
  }, [enabled, readingLine, show, send])

  const ready =
    show != null &&
    text != null &&
    speed != null &&
    fontSize != null &&
    readingLine != null
  return {
    text,
    setText,
    speed,
    setSpeed,
    fontSize,
    setFontSize,
    readingLine,
    setReadingLine,
    ready,
  }
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
  const [dragging, setDragging] = useState(false)
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
    !dragging &&
    pending != null &&
    show != null &&
    Math.abs(show.offsetPx - pending) <= 1
  ) {
    setPending(null)
  }

  function endDrag() {
    setDragging(false)
    setPending((current) =>
      current != null && show != null && Math.abs(show.offsetPx - current) <= 1
        ? null
        : current,
    )
  }
  const sliderOffset = Math.min(pending ?? clampedLive, sliderMax > 0 ? sliderMax : 0)
  const progress = sliderMax > 0 ? Math.round((sliderOffset / sliderMax) * 100) : 0
  const t = useTranslations("Controller")

  return (
    <label className="flex flex-col gap-2 text-sm text-zinc-300" htmlFor="position">
      <span className="flex items-center justify-between">
        {t("position")}
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
        aria-valuetext={t("positionValue", { progress })}
        onPointerDown={() => {
          setDragging(true)
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

const modalClassName =
  "fixed top-auto right-auto bottom-6 left-1/2 z-40 m-0 h-fit w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-white/15 bg-zinc-950 p-4 text-white outline-none backdrop:bg-black/70 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"

function useModalDialog(
  onDismiss: () => void,
  initialFocusRef: { readonly current: HTMLElement | null },
) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const onDismissRef = useRef(onDismiss)
  const reasonRef = useRef<"confirm" | "dismiss">("dismiss")
  const notifyRef = useRef(false)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    notifyRef.current = true
    reasonRef.current = "dismiss"
    if (!dialog.open) dialog.showModal()
    initialFocusRef.current?.focus()
    return () => {
      notifyRef.current = false
    }
  }, [initialFocusRef])

  function dismiss() {
    if (!notifyRef.current) return
    notifyRef.current = false
    onDismissRef.current()
  }

  function closeDialog(reason: "confirm" | "dismiss") {
    reasonRef.current = reason
    const dialog = dialogRef.current
    if (dialog?.open) dialog.close()
    if (reason === "dismiss") dismiss()
    else notifyRef.current = false
  }

  function handleClose() {
    if (reasonRef.current === "dismiss") dismiss()
  }

  return { dialogRef, closeDialog, handleClose }
}

function TransportIcon({ name }: { name: "rewind" | "play" | "pause" | "forward" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="currentColor">
      {name === "rewind" && (
        <>
          <polygon points="11,5 2,12 11,19" />
          <polygon points="20,5 11,12 20,19" />
        </>
      )}
      {name === "play" && <polygon points="8,5 19,12 8,19" />}
      {name === "pause" && (
        <>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </>
      )}
      {name === "forward" && (
        <>
          <polygon points="4,5 13,12 4,19" />
          <polygon points="13,5 22,12 13,19" />
        </>
      )}
    </svg>
  )
}

function ClearDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const t = useTranslations("Controller")
  const { dialogRef, closeDialog, handleClose } = useModalDialog(onCancel, cancelRef)

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby="clear-title"
      aria-describedby="clear-body"
      className={modalClassName}
      onClose={handleClose}
    >
      <h2 id="clear-title" className="text-lg font-semibold">
        {t("clearTitle")}
      </h2>
      <p id="clear-body" className="mt-2 text-sm text-zinc-300">
        {t("clearBody")}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          ref={cancelRef}
          type="button"
          className="rounded-lg border border-white/15 px-3 py-3 text-base font-medium"
          onClick={() => closeDialog("dismiss")}
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          className="rounded-lg bg-white px-3 py-3 text-base font-medium text-black"
          onClick={() => {
            closeDialog("confirm")
            onConfirm()
          }}
        >
          {t("clear")}
        </button>
      </div>
    </dialog>
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
  const t = useTranslations("Controller")
  const { dialogRef, closeDialog, handleClose } = useModalDialog(onCancel, continueRef)

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby="takeover-title"
      aria-describedby="takeover-body"
      className={modalClassName}
      onClose={handleClose}
    >
      <h2 id="takeover-title" className="text-lg font-semibold">
        {t("takeoverTitle")}
      </h2>
      <p id="takeover-body" className="mt-2 text-sm text-zinc-300">
        {t("takeoverBody")}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-3 text-base font-medium"
          onClick={() => closeDialog("dismiss")}
        >
          {t("cancel")}
        </button>
        <button
          ref={continueRef}
          type="button"
          className="rounded-lg bg-white px-3 py-3 text-base font-medium text-black"
          onClick={() => {
            closeDialog("confirm")
            onContinue()
          }}
        >
          {t("continue")}
        </button>
      </div>
    </dialog>
  )
}

function resolveControllerLabel(
  t: (key: "reconnecting" | "paused" | "countdown" | "playing" | "connecting" | "inactive") => string,
  lease: string,
  active: boolean,
  show: Show | null,
  connected: boolean,
  at: number,
): string {
  if (!active) return lease === "checking" ? t("connecting") : t("inactive")
  if (!show) return t("connecting")
  return statusLabel(t, show, connected, at)
}

function useControllerLabel(
  lease: string,
  show: Show | null,
  connected: boolean,
  now: () => number,
  t: (key: "reconnecting" | "paused" | "countdown" | "playing" | "connecting" | "inactive") => string,
) {
  const [at, setAt] = useState(0)
  const active = lease === "active"
  const moving = show != null && show.status !== "paused"

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

  return resolveControllerLabel(t, lease, active, show, connected, at)
}

function ControllerHeader({
  locale,
  label,
  onLocaleChange,
}: {
  locale: string
  label: string
  onLocaleChange: (next: string) => void
}) {
  const t = useTranslations("Controller")
  return (
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <label htmlFor="language">
        <span className="sr-only">{t("language")}</span>
        <select
          id="language"
          className="rounded-lg border border-white/15 bg-zinc-950 px-2 py-1 text-sm text-white outline-none focus:border-white/40"
          value={locale}
          onChange={(event) => onLocaleChange(event.target.value)}
        >
          <option value="en">{t("english")}</option>
          <option value="es">{t("spanish")}</option>
        </select>
      </label>
      <p className="text-sm text-zinc-400">{label}</p>
    </header>
  )
}

function ControllerLeaseNotices({
  lease,
  replaced,
  unauthorized,
  requestTakeover,
  confirmTakeover,
  cancelTakeover,
}: {
  lease: string
  replaced: boolean
  unauthorized: boolean
  requestTakeover: () => void
  confirmTakeover: () => void
  cancelTakeover: () => void
}) {
  const t = useTranslations("Controller")
  return (
    <>
      {unauthorized && (
        <p className="rounded-lg border border-red-400/40 bg-red-950/60 px-3 py-2 text-sm" role="alert">
          {t.rich("sessionExpired", {
            link: (chunks) => (
              <Link className="underline" href="/login">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}

      {lease === "displaced" && (
        <div className="rounded-lg border border-white/15 bg-zinc-950 px-3 py-3 text-sm" role="alert">
          <p>{replaced ? t("displaced") : t("notActive")}</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black"
            onClick={requestTakeover}
          >
            {t("useThisScreen")}
          </button>
        </div>
      )}

      {lease === "inactive" && (
        <div className="rounded-lg border border-white/15 bg-zinc-950 px-3 py-3 text-sm" role="status">
          <p>{t("notActive")}</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-black"
            onClick={requestTakeover}
          >
            {t("useThisScreen")}
          </button>
        </div>
      )}

      {lease === "occupied" && (
        <TakeoverDialog onContinue={confirmTakeover} onCancel={cancelTakeover} />
      )}
    </>
  )
}

function ControllerScriptPanel({
  controlsReady,
  text,
  setText,
  confirmClear,
  setConfirmClear,
}: {
  controlsReady: boolean
  text: string | null
  setText: (value: string | null) => void
  confirmClear: boolean
  setConfirmClear: (value: boolean) => void
}) {
  const t = useTranslations("Controller")
  return (
    <>
      <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1 lg:h-full">
        <label
          className="flex flex-col gap-1 text-sm text-zinc-300 lg:min-h-0 lg:flex-1"
          htmlFor="script"
        >
          {t("script")}
          <textarea
            id="script"
            className="min-h-40 w-full resize-y rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-base text-white outline-none focus:border-white/40 lg:min-h-0 lg:flex-1"
            value={text ?? ""}
            disabled={!controlsReady}
            spellCheck
            onChange={(event) => setText(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="shrink-0 rounded-lg border border-white/15 px-3 py-3 text-base font-medium disabled:opacity-50"
          disabled={!controlsReady || text === ""}
          onClick={() => setConfirmClear(true)}
        >
          {t("clear")}
        </button>
      </div>

      {confirmClear && controlsReady && (
        <ClearDialog
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setText("")
            setConfirmClear(false)
          }}
        />
      )}
    </>
  )
}

function ControllerTuning({
  controlsReady,
  speed,
  setSpeed,
  fontSize,
  setFontSize,
}: {
  controlsReady: boolean
  speed: string | null
  setSpeed: (value: string | null) => void
  fontSize: string | null
  setFontSize: (value: string | null) => void
}) {
  const t = useTranslations("Controller")
  return (
    <div className="flex flex-col gap-4 lg:col-span-2 lg:grid lg:grid-cols-2">
      <label className="flex flex-col gap-2 text-sm text-zinc-300" htmlFor="speed">
        <span className="flex items-center justify-between">
          {t("speed")}
          <span className="text-zinc-400">{speed ?? ""}</span>
        </span>
        <input
          id="speed"
          className="h-8 w-full cursor-pointer accent-white disabled:cursor-default disabled:opacity-40"
          type="range"
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={1}
          value={speed ?? MIN_SPEED}
          disabled={!controlsReady}
          aria-valuemin={MIN_SPEED}
          aria-valuemax={MAX_SPEED}
          aria-valuenow={Number(speed ?? MIN_SPEED)}
          aria-valuetext={t("speedValue", { speed: speed ?? "" })}
          onChange={(event) => setSpeed(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-zinc-300" htmlFor="font-size">
        <span className="flex items-center justify-between">
          {t("textSize")}
          <span className="text-zinc-400">{fontSize ?? ""}</span>
        </span>
        <input
          id="font-size"
          className="h-8 w-full cursor-pointer accent-white disabled:cursor-default disabled:opacity-40"
          type="range"
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          step={1}
          value={fontSize ?? MIN_FONT_SIZE}
          disabled={!controlsReady}
          aria-valuemin={MIN_FONT_SIZE}
          aria-valuemax={MAX_FONT_SIZE}
          aria-valuenow={Number(fontSize ?? MIN_FONT_SIZE)}
          aria-valuetext={t("textSizeValue", { size: fontSize ?? "" })}
          onChange={(event) => setFontSize(event.target.value)}
        />
      </label>
    </div>
  )
}

function ReadingLineControl({
  controlsReady,
  readingLine,
  setReadingLine,
}: {
  controlsReady: boolean
  readingLine: string | null
  setReadingLine: (value: string | null) => void
}) {
  const t = useTranslations("Controller")
  return (
    <label className="flex flex-col gap-2 text-sm text-zinc-300" htmlFor="reading-line">
      <span className="flex items-center justify-between">
        {t("readingLine")}
        <span className="text-zinc-400">{readingLine == null ? "" : `${readingLine}%`}</span>
      </span>
      <input
        id="reading-line"
        className="h-8 w-full cursor-pointer accent-white disabled:cursor-default disabled:opacity-40"
        type="range"
        min={0}
        max={100}
        step={1}
        value={readingLine ?? Math.round(DEFAULT_READING_LINE * 100)}
        disabled={!controlsReady}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number(readingLine ?? Math.round(DEFAULT_READING_LINE * 100))}
        aria-valuetext={t("readingLineValue", { percent: readingLine ?? "" })}
        onChange={(event) => setReadingLine(event.target.value)}
      />
    </label>
  )
}

function ControllerTransport({
  show,
  controlsReady,
  run,
}: {
  show: Show | null
  controlsReady: boolean
  run: (action: ShowAction) => void
}) {
  const t = useTranslations("Controller")
  return (
    <>
      <button
        type="button"
        className="flex items-center justify-between rounded-lg border border-white/15 px-3 py-3 text-left text-base disabled:opacity-50 lg:col-span-2"
        aria-pressed={show?.mirrored ?? false}
        disabled={!controlsReady}
        onClick={() => run({ type: "mirrored", mirrored: !show?.mirrored })}
      >
        {t("mirror")}
        <span className="text-sm text-zinc-400">{show?.mirrored ? t("on") : t("off")}</span>
      </button>

      <div className="grid grid-cols-4 gap-2 lg:col-span-2 lg:w-full lg:max-w-lg lg:justify-self-start">
        <button
          type="button"
          className="flex items-center justify-center rounded-lg border border-white/15 px-3 py-3 disabled:opacity-50"
          aria-label={t("rewind")}
          disabled={!controlsReady}
          onClick={() => run({ type: "nudge", direction: -1 })}
        >
          <TransportIcon name="rewind" />
        </button>
        <button
          type="button"
          className="flex items-center justify-center rounded-lg bg-white px-3 py-3 text-black disabled:opacity-50"
          aria-label={t("play")}
          disabled={!controlsReady}
          onClick={() => run({ type: "play" })}
        >
          <TransportIcon name="play" />
        </button>
        <button
          type="button"
          className="flex items-center justify-center rounded-lg border border-white/15 px-3 py-3 disabled:opacity-50"
          aria-label={t("pause")}
          disabled={!controlsReady}
          onClick={() => run({ type: "pause" })}
        >
          <TransportIcon name="pause" />
        </button>
        <button
          type="button"
          className="flex items-center justify-center rounded-lg border border-white/15 px-3 py-3 disabled:opacity-50"
          aria-label={t("forward")}
          disabled={!controlsReady}
          onClick={() => run({ type: "nudge", direction: 1 })}
        >
          <TransportIcon name="forward" />
        </button>
      </div>

      <button
        type="button"
        className="rounded-lg border border-white/15 px-3 py-3 text-base font-medium disabled:opacity-50 lg:col-span-2 lg:w-full lg:max-w-lg lg:justify-self-start"
        disabled={!controlsReady}
        onClick={() => run({ type: "reset" })}
      >
        {t("reset")}
      </button>
    </>
  )
}

function ControllerLiveView({
  show,
  now,
  onExtent,
}: {
  show: Show | null
  now: () => number
  onExtent: (next: number) => void
}) {
  const t = useTranslations("Controller")
  return (
    <section className="flex flex-col gap-2 lg:col-start-2 lg:row-start-1">
      <h2 className="text-sm text-zinc-300">{t("liveView")}</h2>
      <div className="aspect-video overflow-hidden rounded-lg border border-white/10">
        {show ? (
          <Prompter show={show} now={now} onExtent={onExtent} mirror={false} />
        ) : (
          <div className="h-full w-full bg-black" />
        )}
      </div>
    </section>
  )
}

function ControllerWorkspace({
  show,
  now,
  send,
  controlsReady,
  text,
  setText,
  speed,
  setSpeed,
  fontSize,
  setFontSize,
  readingLine,
  setReadingLine,
  extent,
  onExtent,
  confirmClear,
  setConfirmClear,
  run,
}: {
  show: Show | null
  now: () => number
  send: (action: ShowAction) => void
  controlsReady: boolean
  text: string | null
  setText: (value: string | null) => void
  speed: string | null
  setSpeed: (value: string | null) => void
  fontSize: string | null
  setFontSize: (value: string | null) => void
  readingLine: string | null
  setReadingLine: (value: string | null) => void
  extent: number
  onExtent: (next: number) => void
  confirmClear: boolean
  setConfirmClear: (value: boolean) => void
  run: (action: ShowAction) => void
}) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
      <ControllerScriptPanel
        controlsReady={controlsReady}
        text={text}
        setText={setText}
        confirmClear={confirmClear}
        setConfirmClear={setConfirmClear}
      />
      <ControllerTuning
        controlsReady={controlsReady}
        speed={speed}
        setSpeed={setSpeed}
        fontSize={fontSize}
        setFontSize={setFontSize}
      />
      <div className="flex flex-col gap-4 lg:col-span-2 lg:grid lg:grid-cols-2">
        <ReadingLineControl
          controlsReady={controlsReady}
          readingLine={readingLine}
          setReadingLine={setReadingLine}
        />
        <PositionBar
          show={show}
          now={now}
          ready={controlsReady}
          extent={extent}
          send={send}
        />
      </div>
      <ControllerTransport show={show} controlsReady={controlsReady} run={run} />
      <ControllerLiveView show={show} now={now} onExtent={onExtent} />
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
  const t = useTranslations("Controller")
  const locale = useLocale()
  const router = useRouter()
  const active = lease === "active"
  const {
    text,
    setText,
    speed,
    setSpeed,
    fontSize,
    setFontSize,
    readingLine,
    setReadingLine,
    ready,
  } = useControllerDrafts(show, send, active)
  const controlsReady = ready && active
  const [extent, setExtent] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)
  const onExtent = useCallback((next: number) => {
    setExtent((current) => (Math.abs(current - next) < 0.5 ? current : next))
  }, [])
  const label = useControllerLabel(lease, show, connected, now, t)

  function changeLocale(next: string) {
    if (next !== "en" && next !== "es") return
    document.cookie = `locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
    router.refresh()
  }

  function run(action: ShowAction) {
    if (!active) return
    void send(action)
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4 lg:max-w-6xl">
      <ControllerHeader locale={locale} label={label} onLocaleChange={changeLocale} />
      <ControllerLeaseNotices
        lease={lease}
        replaced={replaced}
        unauthorized={unauthorized}
        requestTakeover={requestTakeover}
        confirmTakeover={confirmTakeover}
        cancelTakeover={cancelTakeover}
      />
      <ControllerWorkspace
        show={show}
        now={now}
        send={send}
        controlsReady={controlsReady}
        text={text}
        setText={setText}
        speed={speed}
        setSpeed={setSpeed}
        fontSize={fontSize}
        setFontSize={setFontSize}
        readingLine={readingLine}
        setReadingLine={setReadingLine}
        extent={extent}
        onExtent={onExtent}
        confirmClear={confirmClear}
        setConfirmClear={setConfirmClear}
        run={run}
      />
      <p className="pb-2 text-center text-sm text-zinc-500">{t("credit")}</p>
    </main>
  )
}
