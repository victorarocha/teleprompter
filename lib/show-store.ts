import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import {
  applyAction,
  sanitizeShow,
  type Show,
  type ShowAction,
} from "@/lib/show-state"

type Listener = () => void

type Store = {
  show: Show
  listeners: Set<Listener>
}

const dataFile = path.join(process.cwd(), "data", "show.json")

const globalStore = globalThis as typeof globalThis & {
  __teleprompter?: Store
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
    }
  }
  return globalStore.__teleprompter
}

export function getShow(): Show {
  return { ...getStore().show }
}

export function updateShow(action: ShowAction): Show {
  const store = getStore()
  const next = applyAction(store.show, action, Date.now())
  if (next === store.show) return { ...store.show }
  store.show = next
  persist(next)
  for (const listener of store.listeners) {
    listener()
  }
  return { ...next }
}

export function subscribe(listener: Listener): () => void {
  const { listeners } = getStore()
  listeners.add(listener)
  return () => listeners.delete(listener)
}
