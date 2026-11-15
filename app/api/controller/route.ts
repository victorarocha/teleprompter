import { cookies } from "next/headers"
import { connection } from "next/server"

import { isValidSession, SESSION_COOKIE } from "@/lib/auth"
import {
  claimController,
  heartbeatController,
  isControllerId,
  releaseController,
} from "@/lib/show-store"

type ControllerAction = "claim" | "heartbeat" | "release"

type ControllerRequest = {
  id: string
  action: ControllerAction
  force: boolean
  epoch: number
}

function isEpoch(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 1e15
}

function parseControllerRequest(input: unknown): ControllerRequest | null {
  if (!input || typeof input !== "object") return null
  const body = input as Record<string, unknown>
  if (!isControllerId(body.id)) return null
  if (body.action !== "claim" && body.action !== "heartbeat" && body.action !== "release") {
    return null
  }
  if (body.action === "heartbeat") {
    return { id: body.id, action: body.action, force: false, epoch: 0 }
  }
  if (!isEpoch(body.epoch)) return null
  return {
    id: body.id,
    action: body.action,
    force: body.force === true,
    epoch: body.epoch,
  }
}

export async function POST(request: Request) {
  await connection()
  const cookieStore = await cookies()
  if (!isValidSession(cookieStore.get(SESSION_COOKIE)?.value)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const command = parseControllerRequest(body)
  if (!command) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }

  if (command.action === "claim") {
    const claim = claimController(command.id, command.force, command.epoch)
    return Response.json(claim, { headers: { "Cache-Control": "no-store" } })
  }

  if (command.action === "heartbeat") {
    if (!heartbeatController(command.id)) {
      return Response.json({ error: "controller-displaced" }, { status: 409 })
    }
    return Response.json(
      { status: "active" },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  releaseController(command.id, command.epoch)
  return Response.json(
    { status: "released" },
    { headers: { "Cache-Control": "no-store" } },
  )
}
