import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import {
  applyAction,
  sanitizeShow,
  type Show,
  type ShowAction,
} from "@/lib/show-state"

type Listener = () => void

type ControllerLease = {
  id: string
  lastSeen: number
  epoch: number
}

type Store = {
  show: Show
  listeners: Set<Listener>
  controller: ControllerLease | null
  leaseVersion: number
}

const CONTROLLER_TTL_MS = 12_000
const CONTROLLER_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/

const dataFile = path.join(process.cwd(), "data", "show.json")

const globalStore = globalThis as typeof globalThis & {
  __teleprompter?: Store
}

export type ControllerClaim = {
  status: "active" | "occupied"
  leaseVersion: number
}

function readShow(): Show {
  try {
    return sanitizeShow(JSON.parse(readFileSync(dataFile, "utf8")))
  } catch {
    return sanitizeShow(null)
  }
}

function persist(show: Show) {
  try {
    mkdirSync(path.dirname(dataFile), { recursive: true })
    writeFileSync(dataFile, JSON.stringify(show))
  } catch (error) {
    console.error("Failed to save teleprompter script", error)
  }
}

function getStore(): Store {
  if (!globalStore.__teleprompter) {
    globalStore.__teleprompter = {
      show: readShow(),
      listeners: new Set(),
      controller: null,
      leaseVersion: 0,
    }
  }
  const store = globalStore.__teleprompter
  if (store.controller === undefined) store.controller = null
  if (typeof store.leaseVersion !== "number") store.leaseVersion = 0
  return store
}

function notify(store: Store) {
  for (const listener of store.listeners) {
    listener()
  }
}

function readLease(store: Store, now: number): ControllerLease | null {
  const lease = store.controller
  if (!lease) return null
  if (now - lease.lastSeen > CONTROLLER_TTL_MS) {
    store.controller = null
    return null
  }
  return lease
}

export function isControllerId(value: unknown): value is string {
  return typeof value === "string" && CONTROLLER_ID_PATTERN.test(value)
}

export function getShow(): Show {
  return { ...getStore().show }
}

export function getControllerId(now = Date.now()): string | null {
  return readLease(getStore(), now)?.id ?? null
}

export function getLeaseVersion(): number {
  return getStore().leaseVersion
}

export function claimController(
  id: string,
  force: boolean,
  epoch: number,
  now = Date.now(),
): ControllerClaim {
  const store = getStore()
  const current = readLease(store, now)
  if (current && current.id !== id && !force) {
    return { status: "occupied", leaseVersion: store.leaseVersion }
  }
  const sameHolder = current?.id === id
  store.controller = { id, lastSeen: now, epoch }
  if (!sameHolder) {
    store.leaseVersion += 1
    notify(store)
  }
  return { status: "active", leaseVersion: store.leaseVersion }
}

export function heartbeatController(id: string, now = Date.now()): boolean {
  const current = readLease(getStore(), now)
  if (!current || current.id !== id) return false
  current.lastSeen = now
  return true
}

export function releaseController(id: string, epoch: number, now = Date.now()) {
  const store = getStore()
  const current = readLease(store, now)
  if (!current || current.id !== id || current.epoch !== epoch) return
  store.controller = null
  store.leaseVersion += 1
  notify(store)
}

export function updateShow(action: ShowAction, controllerId: string): Show | null {
  const now = Date.now()
  if (!heartbeatController(controllerId, now)) return null
  const store = getStore()
  const next = applyAction(store.show, action, now)
  if (next === store.show) return { ...store.show }
  store.show = next
  persist(next)
  notify(store)
  return { ...next }
}

export function subscribe(listener: Listener): () => void {
  const { listeners } = getStore()
  listeners.add(listener)
  return () => listeners.delete(listener)
}
