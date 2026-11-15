export const LINE_HEIGHT = 1.35
export const STAGE_WIDTH = 960
export const STAGE_HEIGHT = 540
export const READING_LINE = 0.2
export const COUNTDOWN_MS = 3000
export const NUDGE_LINES = 3
export const DEFAULT_FONT_SIZE = 42
export const DEFAULT_SPEED = 40
export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 200
export const MIN_SPEED = 0
export const MAX_SPEED = 300
export const MAX_TEXT_LENGTH = 200_000

export type ShowStatus = "paused" | "countdown" | "playing"

export type Show = {
  text: string
  fontSize: number
  speed: number
  mirrored: boolean
  status: ShowStatus
  offsetPx: number
  playingSince: number | null
  countdownEndsAt: number | null
  updatedAt: number
}

export type ShowAction =
  | { type: "text"; text: string }
  | { type: "fontSize"; fontSize: number }
  | { type: "speed"; speed: number }
  | { type: "mirrored"; mirrored: boolean }
  | { type: "play" }
  | { type: "pause" }
  | { type: "reset" }
  | { type: "nudge"; direction: -1 | 1 }
  | { type: "seek"; offsetPx: number }

export function defaultShow(now = Date.now()): Show {
  return {
    text: "",
    fontSize: DEFAULT_FONT_SIZE,
    speed: DEFAULT_SPEED,
    mirrored: false,
    status: "paused",
    offsetPx: 0,
    playingSince: null,
    countdownEndsAt: null,
    updatedAt: now,
  }
}

export function lineJump(fontSize: number): number {
  return fontSize * LINE_HEIGHT * NUDGE_LINES
}

export function offsetAt(show: Show, now: number): number {
  let offset = show.offsetPx
  if (show.status === "playing" && show.playingSince != null) {
    offset = show.offsetPx + (show.speed * (now - show.playingSince)) / 1000
  } else if (
    show.status === "countdown" &&
    show.countdownEndsAt != null &&
    now >= show.countdownEndsAt
  ) {
    offset =
      show.offsetPx + (show.speed * (now - show.countdownEndsAt)) / 1000
  }
  return Math.max(0, offset)
}

export function countdownRemaining(show: Show, now: number): number | null {
  if (show.status !== "countdown" || show.countdownEndsAt == null) return null
  const remainingMs = show.countdownEndsAt - now
  if (remainingMs <= 0) return null
  return Math.ceil(remainingMs / 1000)
}

export function isScrolling(show: Show, now: number): boolean {
  if (show.status === "playing") return true
  return (
    show.status === "countdown" &&
    show.countdownEndsAt != null &&
    now >= show.countdownEndsAt
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function sanitizeShow(input: unknown, now = Date.now()): Show {
  const base = defaultShow(now)
  if (!input || typeof input !== "object") return base
  const raw = input as Record<string, unknown>
  let status: ShowStatus = "paused"
  if (raw.status === "paused" || raw.status === "countdown" || raw.status === "playing") {
    status = raw.status
  }
  const playingSince = finiteNumber(raw.playingSince, Number.NaN)
  const countdownEndsAt = finiteNumber(raw.countdownEndsAt, Number.NaN)
  if (status === "playing" && !Number.isFinite(playingSince)) status = "paused"
  if (status === "countdown" && !Number.isFinite(countdownEndsAt)) status = "paused"

  return {
    text: typeof raw.text === "string" ? raw.text.slice(0, MAX_TEXT_LENGTH) : "",
    fontSize: clamp(
      finiteNumber(raw.fontSize, DEFAULT_FONT_SIZE),
      MIN_FONT_SIZE,
      MAX_FONT_SIZE,
    ),
    speed: clamp(finiteNumber(raw.speed, DEFAULT_SPEED), MIN_SPEED, MAX_SPEED),
    mirrored: raw.mirrored === true,
    status,
    offsetPx: Math.max(0, finiteNumber(raw.offsetPx, 0)),
    playingSince: status === "playing" ? playingSince : null,
    countdownEndsAt: status === "countdown" ? countdownEndsAt : null,
    updatedAt: finiteNumber(raw.updatedAt, now),
  }
}

export function parseAction(input: unknown): ShowAction | null {
  if (!input || typeof input !== "object") return null
  const body = input as Record<string, unknown>
  switch (body.type) {
    case "text":
      return typeof body.text === "string"
        ? { type: "text", text: body.text.slice(0, MAX_TEXT_LENGTH) }
        : null
    case "fontSize":
      return typeof body.fontSize === "number" && Number.isFinite(body.fontSize)
        ? { type: "fontSize", fontSize: body.fontSize }
        : null
    case "speed":
      return typeof body.speed === "number" && Number.isFinite(body.speed)
        ? { type: "speed", speed: body.speed }
        : null
    case "mirrored":
      return typeof body.mirrored === "boolean"
        ? { type: "mirrored", mirrored: body.mirrored }
        : null
    case "play":
    case "pause":
    case "reset":
      return { type: body.type }
    case "nudge":
      return body.direction === -1 || body.direction === 1
        ? { type: "nudge", direction: body.direction }
        : null
    case "seek":
      return typeof body.offsetPx === "number" && Number.isFinite(body.offsetPx)
        ? { type: "seek", offsetPx: Math.max(0, body.offsetPx) }
        : null
    default:
      return null
  }
}

export function applyAction(show: Show, action: ShowAction, now: number): Show {
  switch (action.type) {
    case "text": {
      if (action.text === show.text) return show
      return { ...show, text: action.text, updatedAt: now }
    }
    case "fontSize": {
      const fontSize = clamp(action.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE)
      if (fontSize === show.fontSize) return show
      return { ...show, fontSize, updatedAt: now }
    }
    case "speed": {
      const speed = clamp(action.speed, MIN_SPEED, MAX_SPEED)
      if (speed === show.speed) return show
      if (!isScrolling(show, now)) return { ...show, speed, updatedAt: now }
      return {
        ...show,
        speed,
        status: "playing",
        offsetPx: offsetAt(show, now),
        playingSince: now,
        countdownEndsAt: null,
        updatedAt: now,
      }
    }
    case "mirrored": {
      if (action.mirrored === show.mirrored) return show
      return { ...show, mirrored: action.mirrored, updatedAt: now }
    }
    case "play": {
      if (isScrolling(show, now)) return show
      if (
        show.status === "countdown" &&
        show.countdownEndsAt != null &&
        now < show.countdownEndsAt
      ) {
        return show
      }
      if (show.offsetPx > 0) {
        return {
          ...show,
          status: "playing",
          playingSince: now,
          countdownEndsAt: null,
          updatedAt: now,
        }
      }
      return {
        ...show,
        status: "countdown",
        countdownEndsAt: now + COUNTDOWN_MS,
        playingSince: null,
        updatedAt: now,
      }
    }
    case "pause": {
      if (show.status === "paused") return show
      return {
        ...show,
        status: "paused",
        offsetPx: offsetAt(show, now),
        playingSince: null,
        countdownEndsAt: null,
        updatedAt: now,
      }
    }
    case "reset": {
      if (
        show.status === "paused" &&
        show.offsetPx === 0 &&
        show.playingSince == null &&
        show.countdownEndsAt == null
      ) {
        return show
      }
      return {
        ...show,
        status: "paused",
        offsetPx: 0,
        playingSince: null,
        countdownEndsAt: null,
        updatedAt: now,
      }
    }
    case "nudge": {
      const scrolling = isScrolling(show, now)
      const offsetPx = Math.max(
        0,
        offsetAt(show, now) + action.direction * lineJump(show.fontSize),
      )
      const status = scrolling ? "playing" : show.status
      const playingSince = scrolling ? now : show.playingSince
      const countdownEndsAt = scrolling ? null : show.countdownEndsAt
      if (
        offsetPx === show.offsetPx &&
        status === show.status &&
        playingSince === show.playingSince &&
        countdownEndsAt === show.countdownEndsAt
      ) {
        return show
      }
      return {
        ...show,
        status,
        offsetPx,
        playingSince,
        countdownEndsAt,
        updatedAt: now,
      }
    }
    case "seek": {
      const scrolling = isScrolling(show, now)
      const offsetPx = Math.max(0, action.offsetPx)
      const current = offsetAt(show, now)
      const status = scrolling ? "playing" : show.status
      const playingSince = scrolling ? now : show.playingSince
      const countdownEndsAt = scrolling ? null : show.countdownEndsAt
      if (
        !scrolling &&
        Math.abs(offsetPx - current) < 0.5 &&
        status === show.status &&
        countdownEndsAt === show.countdownEndsAt
      ) {
        return show
      }
      return {
        ...show,
        status,
        offsetPx,
        playingSince,
        countdownEndsAt,
        updatedAt: now,
      }
    }
  }
}
